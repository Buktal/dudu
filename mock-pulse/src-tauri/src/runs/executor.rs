//! 剧本/编排执行器：接收前端物化好的「运行快照」（纯数据：每步的渠道、事件名、
//! 期望回执、拼装好的明文载荷）+ 各渠道连接配置，串行执行步骤——
//! 每步按渠道路由到既有协议原语（抖音 sha1 签名 JSON POST / 企微 AES 信封
//! XML POST，复用 connections::dispatch_event，不复制协议代码），经进度回调
//! 实时回报每步状态（等待/成功/失败），结束后组装 RunRecord。Rust 不感知
//! 素材库/剧本概念，只执行快照。
//!
//! 编排（#21）：serial = 逐剧本完整执行（前剧结束才启下一剧，可选失败即停）；
//! parallel = 每剧本一线程 T+0 同时起跑、剧内严格有序（ADR-0004 并发语义），
//! 失败即停用共享取消旗标承载——任一剧本失败置位，各剧本每步启动前检查
//! （在途步骤自然完成）。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::{Emitter, Manager};

use crate::connections::douyin;
use crate::connections::wecom;
use crate::connections::ConnectionConfig;
use crate::plans::{PlanFailure, PlanMode};

use super::store;
use super::verdict::{compare_receipt, ExpectedReceipt};
use super::{ReceiptSnapshot, RunRecord, RunStep, RunVerdict};

/// 快照中的一个步骤（前端 materializeRunSnapshot 产出）。
#[derive(Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioStepSnapshot {
    pub event_name: String,
    pub event_id: String,
    /// 抖音 | 企微对应的渠道标识（douyin/wecom）
    pub channel: String,
    pub expected: ExpectedReceipt,
    /// 前端逐字节拼装好的明文载荷（wireBodyText 产出）
    pub body: String,
}

/// 一次剧本运行的完整快照（纯数据，启动时固化，后续编辑不影响）。
#[derive(Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioRunSnapshot {
    pub run_id: String,
    pub scenario_id: String,
    pub scenario_name: String,
    /// 启动时间（ISO，前端生成）
    pub started_at: String,
    pub steps: Vec<ScenarioStepSnapshot>,
}

/// 一次编排运行的完整快照：每个 lane = 一个已物化的剧本运行快照
/// （前端 materializePlanRun 产出，启动时固化）。mode/failure 与编排文档一致。
#[derive(Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlanRunSnapshot {
    pub run_id: String,
    pub plan_id: String,
    pub plan_name: String,
    pub mode: PlanMode,
    pub failure: PlanFailure,
    /// 启动时间（ISO，前端生成）
    pub started_at: String,
    /// lanes（有序）：每个剧本一份运行快照
    pub scenarios: Vec<ScenarioRunSnapshot>,
}

/// 执行进度（经回调注入：Tauri 命令接 emit，cargo 测试接收集器）。
#[derive(Clone, Debug, PartialEq)]
pub enum StepProgress {
    /// 步骤开始发送
    Waiting { index: usize },
    /// 步骤发送完成（failed = 发送错误或与期望不符）
    Finished { index: usize, step: RunStep, failed: bool },
    /// 前序失败，本步骤不发送
    Skipped { index: usize },
}

/// 编排执行进度：带 lane 归属的步骤进度（lane = 快照内 scenarios 下标）。
#[derive(Clone, Debug, PartialEq)]
pub struct LaneProgress {
    pub lane: usize,
    pub progress: StepProgress,
}

/// run-progress 事件载荷（camelCase，与前端 slice 的 onRunProgress 对齐）。
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RunProgressEvent {
    pub run_id: String,
    pub index: usize,
    /// waiting | success | failed | skipped | finished
    pub status: String,
    /// 编排运行：进度所属 lane 序号（剧本运行/finished 缺省不序列化）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lane: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<RunStep>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run: Option<RunRecord>,
}

/// 串行执行快照：每步 waiting → 按渠道路由发送 → 比对期望 → finished；
/// 失败即停，后续步骤 skipped。返回组装好的运行记录（不落盘）。
pub fn execute_snapshot<F: FnMut(StepProgress)>(
    snapshot: &ScenarioRunSnapshot,
    connections: &[ConnectionConfig],
    timeout: Duration,
    on_progress: &mut F,
) -> RunRecord {
    // 剧本单发没有编排取消旗标：always false，步骤永不因旗标被跳过
    let cancel = AtomicBool::new(false);
    let (steps, _) = execute_lane_steps(
        snapshot,
        connections,
        timeout,
        &cancel,
        false,
        on_progress,
    );
    RunRecord {
        id: snapshot.run_id.clone(),
        started_at: snapshot.started_at.clone(),
        source: "scenario".into(),
        scenario_name: Some(snapshot.scenario_name.clone()),
        plan_name: None,
        steps,
    }
}

/// 单 lane（剧本）执行：每步 waiting → 发送 → 比对 → finished。
/// - 剧内保持失败即停：本剧本某步失败后，后续步骤记 skipped；
/// - not_started = 编排失败即停下前序剧本已失败：本剧本整体不启动（全 skipped）；
/// - 每步启动前检查取消旗标（编排并行 + 失败即停：其他剧本失败后不再启动
///   后续步骤，在途步骤自然完成）。
/// 返回（步骤记录, 本剧本是否有失败步骤）。skipped 步骤的结论区分三种来源：
/// 本剧本前序失败 / 前序剧本失败未启动 / 其他剧本失败编排停止。
fn execute_lane_steps<F: FnMut(StepProgress)>(
    snapshot: &ScenarioRunSnapshot,
    connections: &[ConnectionConfig],
    timeout: Duration,
    cancel: &AtomicBool,
    not_started: bool,
    on_progress: &mut F,
) -> (Vec<RunStep>, bool) {
    const OWN_FAILED: &str = "前序步骤失败，本步骤未执行";
    const PREVIOUS_SCENARIO_FAILED: &str = "前序剧本失败，本剧本未执行";
    const ORCHESTRATION_STOPPED: &str = "其他剧本已失败，编排停止，本剧本未执行";

    let mut steps: Vec<RunStep> = Vec::with_capacity(snapshot.steps.len());
    let mut own_failed = false;
    // 非 None 后本剧本不再启动任何步骤（整体未启动 / 编排停止）
    let mut halt_reason: Option<&'static str> =
        not_started.then_some(PREVIOUS_SCENARIO_FAILED);
    for (index, step_snapshot) in snapshot.steps.iter().enumerate() {
        let skip_reason: Option<&'static str> = if own_failed {
            Some(OWN_FAILED)
        } else {
            match halt_reason {
                Some(reason) => Some(reason),
                None => {
                    if cancel.load(Ordering::Relaxed) {
                        halt_reason = Some(ORCHESTRATION_STOPPED);
                        halt_reason
                    } else {
                        None
                    }
                }
            }
        };
        if let Some(reason) = skip_reason {
            on_progress(StepProgress::Skipped { index });
            steps.push(skipped_step(step_snapshot, connections, reason));
            continue;
        }
        on_progress(StepProgress::Waiting { index });
        let step = execute_step(step_snapshot, connections, timeout);
        let failed = step.receipt.error.is_some() || !step.verdict.passed;
        on_progress(StepProgress::Finished {
            index,
            step: step.clone(),
            failed,
        });
        if failed {
            own_failed = true;
            // 失败即停语义在编排内跨剧本传播（并行旗标 / 串行顺序检查）
            cancel.store(true, Ordering::Relaxed);
        }
        steps.push(step);
    }
    (steps, own_failed)
}

/// 给步骤打 lane 归属（编排运行记录：步骤按 lane 顺序拼接，各步携带归属）。
fn tag_lane(mut step: RunStep, lane: usize, scenario_name: &str) -> RunStep {
    step.lane_index = Some(lane);
    step.lane_name = Some(scenario_name.into());
    step
}

/// 编排执行（#21）：serial 按序逐剧本完整执行；parallel 每剧本一线程
/// T+0 同时起跑、剧内严格有序。失败策略：
/// - stop = 任一剧本失败即停整个编排（后续剧本不启动 / 并行下后续步骤不启动）；
/// - continue = 记录后继续，全部剧本执行完毕（剧内失败即停语义不变）。
/// 步骤按 lane 顺序拼接入运行记录。进度回调带 lane 序号。
pub fn execute_plan<F>(
    snapshot: &PlanRunSnapshot,
    connections: &[ConnectionConfig],
    timeout: Duration,
    on_progress: &mut F,
) -> RunRecord
where
    F: FnMut(LaneProgress) + Send,
{
    let steps = match snapshot.mode {
        PlanMode::Serial => {
            execute_plan_serial(snapshot, connections, timeout, on_progress)
        }
        PlanMode::Parallel => {
            execute_plan_parallel(snapshot, connections, timeout, on_progress)
        }
    };
    RunRecord {
        id: snapshot.run_id.clone(),
        started_at: snapshot.started_at.clone(),
        source: "plan".into(),
        scenario_name: None,
        plan_name: Some(snapshot.plan_name.clone()),
        steps,
    }
}

/// 串行编排：前剧完全结束才启下一剧；失败即停下未启动的剧本整体记 skipped。
fn execute_plan_serial<F: FnMut(LaneProgress)>(
    snapshot: &PlanRunSnapshot,
    connections: &[ConnectionConfig],
    timeout: Duration,
    on_progress: &mut F,
) -> Vec<RunStep> {
    let stop_on_failure = snapshot.failure == PlanFailure::Stop;
    let mut previous_failed = false;
    let mut all_steps = Vec::new();
    for (lane, scenario) in snapshot.scenarios.iter().enumerate() {
        // 串行的失败传播走 not_started（顺序检查）；旗标每剧独立，
        // 不把「本剧失败」泄漏成对后续剧本的取消信号
        let cancel = AtomicBool::new(false);
        let not_started = previous_failed && stop_on_failure;
        let (steps, failed) = execute_lane_steps(
            scenario,
            connections,
            timeout,
            &cancel,
            not_started,
            &mut |progress: StepProgress| {
                on_progress(LaneProgress { lane, progress });
            },
        );
        all_steps.extend(
            steps
                .into_iter()
                .map(|step| tag_lane(step, lane, &scenario.scenario_name)),
        );
        if failed {
            previous_failed = true;
        }
    }
    all_steps
}

/// 并行编排：每剧本一线程同时启动（T+0 起跑），剧内步骤严格串行；
/// 失败即停用共享取消旗标——任一剧本失败置位，各剧本每步启动前检查
/// （在途步骤自然完成）；continue 各剧本各跑到底（旗标不共享、互不影响）。
fn execute_plan_parallel<F>(
    snapshot: &PlanRunSnapshot,
    connections: &[ConnectionConfig],
    timeout: Duration,
    on_progress: &mut F,
) -> Vec<RunStep>
where
    F: FnMut(LaneProgress) + Send,
{
    let stop_on_failure = snapshot.failure == PlanFailure::Stop;
    let shared_cancel = Arc::new(AtomicBool::new(false));
    // 并发 lane 共享一个进度回调（FnMut 需互斥；锁毒化视为不可恢复错误）
    let sink = Mutex::new(on_progress);
    // scoped 线程：快照与连接都是本函数栈上借用，无需 'static
    let outcomes: Vec<(Vec<RunStep>, bool)> = std::thread::scope(|scope| {
        let handles: Vec<_> = snapshot
            .scenarios
            .iter()
            .enumerate()
            .map(|(lane, scenario)| {
                let cancel = Arc::clone(&shared_cancel);
                let sink = &sink;
                scope.spawn(move || {
                    // continue：旗标不共享——失败只影响本剧内，不拦其他剧本
                    let lane_cancel = if stop_on_failure {
                        cancel
                    } else {
                        Arc::new(AtomicBool::new(false))
                    };
                    let mut on_lane = |progress: StepProgress| {
                        let mut guard = sink
                            .lock()
                            .unwrap_or_else(|poisoned| poisoned.into_inner());
                        guard(LaneProgress { lane, progress });
                    };
                    execute_lane_steps(
                        scenario,
                        connections,
                        timeout,
                        &lane_cancel,
                        false,
                        &mut on_lane,
                    )
                })
            })
            .collect();
        handles
            .into_iter()
            .map(|handle| {
                handle
                    .join()
                    .expect("编排 lane 线程不应 panic")
            })
            .collect()
    });
    // 记录按 lane 顺序拼接（与完成先后无关）
    let mut all_steps = Vec::new();
    for (lane, (steps, _)) in outcomes.into_iter().enumerate() {
        let name = &snapshot.scenarios[lane].scenario_name;
        all_steps
            .extend(steps.into_iter().map(|step| tag_lane(step, lane, name)));
    }
    all_steps
}

/// 未执行的步骤快照（保留事件名/载荷等快照事实，标记 skipped + 未执行原因）。
fn skipped_step(
    step: &ScenarioStepSnapshot,
    connections: &[ConnectionConfig],
    reason: &str,
) -> RunStep {
    let url = channel_url(&step.channel, connections).unwrap_or_default();
    RunStep {
        event_name: step.event_name.clone(),
        event_id: step.event_id.clone(),
        channel: step.channel.clone(),
        url,
        payload: step.body.clone(),
        signature: String::new(),
        msg_id: String::new(),
        timestamp: None,
        receipt: ReceiptSnapshot {
            status: 0,
            elapsed_ms: 0,
            body: String::new(),
            reply: None,
            error: None,
        },
        verdict: RunVerdict {
            passed: false,
            reason: reason.into(),
        },
        skipped: true,
        lane_index: None,
        lane_name: None,
    }
}

/// 按渠道取连接配置里的目标地址（连接缺失时 None）。
fn channel_url(channel: &str, connections: &[ConnectionConfig]) -> Option<String> {
    connections.iter().find_map(|config| match config {
        ConnectionConfig::Douyin { url, .. } if channel == "douyin" => Some(url.clone()),
        ConnectionConfig::Wecom { url, .. } if channel == "wecom" => Some(url.clone()),
        _ => None,
    })
}

/// 未发出请求即失败的步骤（连接缺失/未知渠道）：结论按期望回执比对推导。
fn failed_without_send(step: &ScenarioStepSnapshot, error: String) -> RunStep {
    let receipt = ReceiptSnapshot {
        status: 0,
        elapsed_ms: 0,
        body: String::new(),
        reply: None,
        error: Some(error),
    };
    let verdict = compare_receipt(&step.expected, &receipt);
    RunStep {
        event_name: step.event_name.clone(),
        event_id: step.event_id.clone(),
        channel: step.channel.clone(),
        url: String::new(),
        payload: step.body.clone(),
        signature: String::new(),
        msg_id: String::new(),
        timestamp: None,
        verdict,
        receipt,
        skipped: false,
        lane_index: None,
        lane_name: None,
    }
}

/// 单步执行：按渠道路由到协议原语（复用 connections::dispatch_event）；
/// 连接缺失/未知渠道直接判失败（不发请求）。超时/连接失败由客户端内建超时承载。
fn execute_step(
    step: &ScenarioStepSnapshot,
    connections: &[ConnectionConfig],
    timeout: Duration,
) -> RunStep {
    match step.channel.as_str() {
        "douyin" => {
            let Some(config) = connections.iter().find(|config| {
                matches!(config, ConnectionConfig::Douyin { .. })
            }) else {
                return failed_without_send(
                    step,
                    "缺少抖音渠道连接配置，无法执行步骤".into(),
                );
            };
            let outcome = douyin::dispatch_event(
                &douyin::client_with_timeout(timeout),
                config,
                &step.body,
            );
            let receipt = ReceiptSnapshot {
                status: outcome.status,
                elapsed_ms: outcome.elapsed_ms,
                body: outcome.body,
                reply: None,
                error: outcome.error,
            };
            let verdict = compare_receipt(&step.expected, &receipt);
            RunStep {
                event_name: step.event_name.clone(),
                event_id: step.event_id.clone(),
                channel: step.channel.clone(),
                url: channel_url("douyin", connections).unwrap_or_default(),
                payload: step.body.clone(),
                signature: outcome.signature,
                msg_id: outcome.msg_id,
                timestamp: None,
                verdict,
                receipt,
                skipped: false,
                lane_index: None,
                lane_name: None,
            }
        }
        "wecom" => {
            let Some(config) = connections.iter().find(|config| {
                matches!(config, ConnectionConfig::Wecom { .. })
            }) else {
                return failed_without_send(
                    step,
                    "缺少企业微信渠道连接配置，无法执行步骤".into(),
                );
            };
            let outcome = wecom::dispatch_event(
                &wecom::client_with_timeout(timeout),
                config,
                &step.body,
            );
            let receipt = ReceiptSnapshot {
                status: outcome.status,
                elapsed_ms: outcome.elapsed_ms,
                body: outcome.body,
                reply: outcome.reply,
                error: outcome.error,
            };
            let verdict = compare_receipt(&step.expected, &receipt);
            RunStep {
                event_name: step.event_name.clone(),
                event_id: step.event_id.clone(),
                channel: step.channel.clone(),
                url: channel_url("wecom", connections).unwrap_or_default(),
                payload: step.body.clone(),
                signature: outcome.signature,
                msg_id: outcome.nonce,
                timestamp: Some(outcome.timestamp),
                verdict,
                receipt,
                skipped: false,
                lane_index: None,
                lane_name: None,
            }
        }
        other => {
            failed_without_send(step, format!("未知渠道：{other}，无法执行步骤"))
        }
    }
}

/// 把 StepProgress 转成 run-progress 事件载荷。
fn progress_event(
    run_id: &str,
    lane: Option<usize>,
    progress: &StepProgress,
) -> RunProgressEvent {
    let base = match progress {
        StepProgress::Waiting { index } => (index, "waiting", None),
        StepProgress::Finished {
            index,
            step,
            failed,
        } => (
            index,
            if *failed { "failed" } else { "success" },
            Some(step.clone()),
        ),
        StepProgress::Skipped { index } => (index, "skipped", None),
    };
    RunProgressEvent {
        run_id: run_id.into(),
        index: *base.0,
        status: base.1.into(),
        lane,
        step: base.2,
        run: None,
    }
}

/// 后台执行：进度经 run-progress 事件回报，完成后运行记录落 runs.json，
/// 并发一条 finished 事件携带完整记录（前端入列）。
fn run_in_background(
    app: tauri::AppHandle,
    snapshot: ScenarioRunSnapshot,
    connections: Vec<ConnectionConfig>,
) {
    let run = execute_snapshot(
        &snapshot,
        &connections,
        Duration::from_secs(5),
        &mut |progress: StepProgress| {
            let _ = app.emit(
                "run-progress",
                progress_event(&snapshot.run_id, None, &progress),
            );
        },
    );
    finish_run(app, snapshot.run_id, run);
}

/// 编排后台执行：进度带 lane 归属经 run-progress 事件回报，
/// 完成后运行记录落 runs.json + finished 事件携带完整记录。
fn run_plan_in_background(
    app: tauri::AppHandle,
    snapshot: PlanRunSnapshot,
    connections: Vec<ConnectionConfig>,
) {
    let run = execute_plan(
        &snapshot,
        &connections,
        Duration::from_secs(5),
        &mut |lane_progress: LaneProgress| {
            let _ = app.emit(
                "run-progress",
                progress_event(
                    &snapshot.run_id,
                    Some(lane_progress.lane),
                    &lane_progress.progress,
                ),
            );
        },
    );
    finish_run(app, snapshot.run_id, run);
}

/// 运行记录落盘（失败仅忽略：记录仍随 finished 事件进入前端列表），
/// 并发 finished 事件携带完整记录。
fn finish_run(app: tauri::AppHandle, run_id: String, run: RunRecord) {
    if let Ok(dir) = app.path().app_data_dir() {
        if let Ok(mut list) = store::load_runs(&dir) {
            list.push(run.clone());
            let _ = store::save_runs(&dir, &list);
        }
    }
    let _ = app.emit(
        "run-progress",
        RunProgressEvent {
            run_id,
            index: run.steps.len(),
            status: "finished".into(),
            lane: None,
            step: None,
            run: Some(run),
        },
    );
}

/// Tauri 命令：后台线程执行快照（进度经 run-progress 事件回报），
/// 完成后运行记录落 runs.json；命令立即返回 run id。
#[tauri::command]
pub async fn start_scenario_run(
    app: tauri::AppHandle,
    snapshot: ScenarioRunSnapshot,
    connections: Vec<ConnectionConfig>,
) -> Result<String, String> {
    let run_id = snapshot.run_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        run_in_background(app, snapshot, connections);
    });
    Ok(run_id)
}

/// Tauri 命令：后台线程执行编排快照（进度带 lane 经 run-progress 事件回报），
/// 完成后运行记录落 runs.json；命令立即返回 run id。
#[tauri::command]
pub async fn start_plan_run(
    app: tauri::AppHandle,
    snapshot: PlanRunSnapshot,
    connections: Vec<ConnectionConfig>,
) -> Result<String, String> {
    let run_id = snapshot.run_id.clone();
    tauri::async_runtime::spawn_blocking(move || {
        run_plan_in_background(app, snapshot, connections);
    });
    Ok(run_id)
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
    use std::sync::mpsc::{channel, Receiver};
    use std::time::{Duration, Instant};

    use super::*;
    use super::super::verdict::ReceiptBodyMode;

    // ---- 测试基建：串行多请求 TcpListener（一个线程顺序 accept） ----

    #[derive(Clone)]
    struct RecordedPost {
        head: String,
        body: String,
        arrived_at: Instant,
        responded_at: Instant,
    }

    impl RecordedPost {
        fn header(&self, name: &str) -> Option<String> {
            self.head.lines().find_map(|line| {
                let (key, value) = line.split_once(':')?;
                if key.trim().eq_ignore_ascii_case(name) {
                    Some(value.trim().to_string())
                } else {
                    None
                }
            })
        }
    }

    fn read_head_and_body(stream: &mut TcpStream) -> (String, String) {
        let mut buf = Vec::new();
        let mut chunk = [0u8; 4096];
        loop {
            let n = stream.read(&mut chunk).unwrap();
            assert!(n > 0, "客户端提前断开");
            buf.extend_from_slice(&chunk[..n]);
            if let Some(split) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                let head = String::from_utf8_lossy(&buf[..split]).to_string();
                let content_length = head
                    .lines()
                    .find_map(|line| {
                        let (k, v) = line.split_once(':')?;
                        if k.trim().eq_ignore_ascii_case("content-length") {
                            v.trim().parse::<usize>().ok()
                        } else {
                            None
                        }
                    })
                    .unwrap_or(0);
                if buf.len() >= split + 4 + content_length {
                    let body = String::from_utf8_lossy(
                        &buf[split + 4..split + 4 + content_length],
                    )
                    .to_string();
                    return (head, body);
                }
            }
        }
    }

    /// 串行监听：一个线程依次处理 count 个请求（accept → 读全 → delay → 响应）。
    /// responder 收到 (序号, 请求行, body) 决定状态行与响应体（可捕获测试上下文）。
    /// 顺序处理保证：第 k+1 个请求的 accept 发生在第 k 个响应写出之后——
    /// 若执行器并行发送，arrival 顺序/时刻断言会捕获。
    fn start_serial_server(
        count: usize,
        responder: std::sync::Arc<dyn Fn(usize, &str, &str) -> (String, String) + Send + Sync>,
        delay: Duration,
    ) -> (SocketAddr, Receiver<RecordedPost>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let (tx, rx) = channel();
        std::thread::spawn(move || {
            for index in 0..count {
                let (mut stream, _) = listener.accept().unwrap();
                let arrived_at = Instant::now();
                let (head, body) = read_head_and_body(&mut stream);
                let request_line = head.lines().next().unwrap_or_default().to_string();
                let (status_line, response_body) = responder(index, &request_line, &body);
                std::thread::sleep(delay);
                let response = format!(
                    "{status_line}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response_body}",
                    response_body.len()
                );
                stream.write_all(response.as_bytes()).unwrap();
                stream.shutdown(Shutdown::Both).unwrap();
                tx.send(RecordedPost {
                    head,
                    body,
                    arrived_at,
                    responded_at: Instant::now(),
                })
                .unwrap();
            }
        });
        (addr, rx)
    }

    fn ok_responder(
    ) -> std::sync::Arc<dyn Fn(usize, &str, &str) -> (String, String) + Send + Sync> {
        std::sync::Arc::new(|_index, _line, _body| {
            ("HTTP/1.1 200 OK".to_string(), "ok".to_string())
        })
    }

    /// 并发监听：每个连接一线程同时处理（accept → 读全 → delay → 响应），
    /// 可观测多剧本请求交错到达。请求身份靠 body 区分（index 只是 accept 序）。
    fn start_concurrent_server(
        count: usize,
        responder: std::sync::Arc<
            dyn Fn(usize, &str, &str) -> (String, String) + Send + Sync,
        >,
        delay: Duration,
    ) -> (SocketAddr, Receiver<RecordedPost>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let (tx, rx) = channel();
        std::thread::spawn(move || {
            for index in 0..count {
                let (mut stream, _) = listener.accept().unwrap();
                let tx = tx.clone();
                let responder = responder.clone();
                std::thread::spawn(move || {
                    let arrived_at = Instant::now();
                    let (head, body) = read_head_and_body(&mut stream);
                    let request_line =
                        head.lines().next().unwrap_or_default().to_string();
                    let (status_line, response_body) =
                        responder(index, &request_line, &body);
                    std::thread::sleep(delay);
                    let response = format!(
                        "{status_line}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response_body}",
                        response_body.len()
                    );
                    stream.write_all(response.as_bytes()).unwrap();
                    stream.shutdown(Shutdown::Both).unwrap();
                    tx.send(RecordedPost {
                        head,
                        body,
                        arrived_at,
                        responded_at: Instant::now(),
                    })
                    .unwrap();
                });
            }
        });
        (addr, rx)
    }

    // ---- 快照/配置构造 ----

    const DY_SECRET: &str = "tt_secret";

    fn douyin_connection(url: String) -> ConnectionConfig {
        ConnectionConfig::Douyin {
            url,
            client_key: "tt_key".into(),
            client_secret: DY_SECRET.into(),
        }
    }

    const WC_CORP_ID: &str = "wx5823bf96d3bd56c7";
    const WC_TOKEN: &str = "QDG6eK";
    const WC_AES_KEY: &str = "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C";

    fn wecom_connection(url: String) -> ConnectionConfig {
        ConnectionConfig::Wecom {
            url,
            corp_id: WC_CORP_ID.into(),
            token: WC_TOKEN.into(),
            encoding_aes_key: WC_AES_KEY.into(),
            agent_id: "218".into(),
        }
    }

    fn dy_step(name: &str, text: &str) -> ScenarioStepSnapshot {
        ScenarioStepSnapshot {
            event_name: name.into(),
            event_id: format!("evt-{name}"),
            channel: "douyin".into(),
            expected: ExpectedReceipt {
                status: 200,
                body: String::new(),
                body_mode: ReceiptBodyMode::Contains,
            },
            body: format!(r#"{{"event":"im_receive_msg","content":{{"text":"{text}"}}}}"#),
        }
    }

    fn snapshot(id: &str, steps: Vec<ScenarioStepSnapshot>) -> ScenarioRunSnapshot {
        ScenarioRunSnapshot {
            run_id: id.into(),
            scenario_id: "scn-1".into(),
            scenario_name: "从进入会话到商品咨询".into(),
            started_at: "2026-09-12T02:00:00.000Z".into(),
            steps,
        }
    }

    fn run_all<F: FnMut(StepProgress)>(
        snapshot: &ScenarioRunSnapshot,
        connections: &[ConnectionConfig],
        timeout: Duration,
        on_progress: &mut F,
    ) -> RunRecord {
        execute_snapshot(snapshot, connections, timeout, on_progress)
    }

    #[test]
    fn executes_steps_in_serial_order_and_records_all_pass() {
        let bodies = ["第一步", "第二步", "第三步"];
        let (addr, rx) = start_serial_server(3, ok_responder(), Duration::ZERO);
        let snap = snapshot(
            "run-serial",
            bodies
                .iter()
                .map(|text| dy_step(text, text))
                .collect(),
        );

        let mut progress = Vec::new();
        let run = run_all(&snap, &[douyin_connection(format!("http://{addr}/hook"))], Duration::from_secs(2), &mut |p| progress.push(p));

        // 请求到达顺序 = 步骤顺序，且串行：第 k 个请求的到达晚于第 k-1 个响应的写出
        let mut requests = Vec::new();
        for _ in 0..3 {
            requests.push(rx.recv_timeout(Duration::from_secs(2)).unwrap());
        }
        for (index, request) in requests.iter().enumerate() {
            assert_eq!(
                request.body, snap.steps[index].body,
                "第 {index} 个到达的请求应是第 {index} 步"
            );
            if index > 0 {
                assert!(
                    requests[index].arrived_at >= requests[index - 1].responded_at,
                    "步骤应等待上一步响应后再发送（串行）"
                );
            }
        }

        // 进度：每步 waiting → success，顺序交错
        let statuses: Vec<&str> = progress
            .iter()
            .map(|p| match p {
                StepProgress::Waiting { .. } => "waiting",
                StepProgress::Finished { failed, .. } => {
                    if *failed { "failed" } else { "success" }
                }
                StepProgress::Skipped { .. } => "skipped",
            })
            .collect();
        assert_eq!(
            statuses,
            vec!["waiting", "success", "waiting", "success", "waiting", "success"],
        );

        // 运行记录：三步全过 + 剧本来源与名称快照
        assert_eq!(run.source, "scenario");
        assert_eq!(run.scenario_name.as_deref(), Some("从进入会话到商品咨询"));
        assert_eq!(run.id, "run-serial");
        assert_eq!(run.started_at, "2026-09-12T02:00:00.000Z");
        assert_eq!(run.steps.len(), 3);
        for (index, step) in run.steps.iter().enumerate() {
            assert!(step.verdict.passed, "步骤 {index}：{:?}", step.verdict);
            assert!(!step.skipped);
            assert_eq!(step.payload, snap.steps[index].body);
            assert_eq!(step.event_name, snap.steps[index].event_name);
            assert_eq!(step.receipt.status, 200);
            assert_eq!(step.receipt.body, "ok");
        }
    }

    #[test]
    fn stops_after_failed_step_and_marks_rest_skipped() {
        // 步骤 2 返回 500（期望 200 → 与期望不符）→ 失败即停，步骤 3 skipped
        let responder: std::sync::Arc<
            dyn Fn(usize, &str, &str) -> (String, String) + Send + Sync,
        > = std::sync::Arc::new(|index, _line, _body| {
            if index == 1 {
                ("HTTP/1.1 500 Internal Server Error".to_string(), "boom".to_string())
            } else {
                ("HTTP/1.1 200 OK".to_string(), "ok".to_string())
            }
        });
        let (addr, rx) = start_serial_server(2, responder, Duration::ZERO);
        let snap = snapshot(
            "run-stop",
            vec![dy_step("a", "a"), dy_step("b", "b"), dy_step("c", "c")],
        );

        let mut progress = Vec::new();
        let run = run_all(&snap, &[douyin_connection(format!("http://{addr}/hook"))], Duration::from_secs(2), &mut |p| progress.push(p));

        // 只有前两步发出请求
        let mut seen = 0;
        while let Ok(_request) = rx.recv_timeout(Duration::from_millis(300)) {
            seen += 1;
        }
        assert_eq!(seen, 2, "失败后不应再有请求");

        // 进度：waiting(0) success(0) → waiting(1) failed(1) → skipped(2)
        assert!(matches!(progress[0], StepProgress::Waiting { index: 0 }));
        assert!(matches!(&progress[1], StepProgress::Finished { index: 0, failed: false, .. }));
        assert!(matches!(progress[2], StepProgress::Waiting { index: 1 }));
        assert!(matches!(&progress[3], StepProgress::Finished { index: 1, failed: true, .. }));
        assert!(matches!(progress[4], StepProgress::Skipped { index: 2 }));

        // 记录：步骤 2 未通过，步骤 3 skipped 且未发送
        assert!(run.steps[0].verdict.passed);
        assert!(!run.steps[1].verdict.passed);
        assert!(run.steps[1].verdict.reason.contains("期望 HTTP 200"));
        assert!(run.steps[2].skipped);
        assert_eq!(run.steps[2].signature, "");
        assert_eq!(run.steps[2].receipt.status, 0);
    }

    #[test]
    fn timeout_step_fails_the_run() {
        // 服务器延迟 1s，执行器超时 200ms：第一步超时记失败，第二步 skipped
        let (addr, _rx) = start_serial_server(1, ok_responder(), Duration::from_secs(1));
        let snap = snapshot(
            "run-timeout",
            vec![dy_step("a", "a"), dy_step("b", "b")],
        );

        let started = Instant::now();
        let mut progress = Vec::new();
        let run = run_all(&snap, &[douyin_connection(format!("http://{addr}/hook"))], Duration::from_millis(200), &mut |p| progress.push(p));

        assert!(started.elapsed() < Duration::from_secs(1), "应按超时上限提前结束");
        assert_eq!(run.steps[0].receipt.status, 0, "未收到响应");
        assert!(run.steps[0]
            .receipt
            .error
            .as_deref()
            .unwrap_or_default()
            .contains("超时"));
        assert!(!run.steps[0].verdict.passed);
        assert!(run.steps[1].skipped);
        assert!(matches!(&progress[1], StepProgress::Finished { index: 0, failed: true, .. }));
    }

    #[test]
    fn douyin_run_signs_each_request_officially() {
        let (addr, rx) = start_serial_server(2, ok_responder(), Duration::ZERO);
        let snap = snapshot("run-dy", vec![dy_step("a", "你好，抖音"), dy_step("b", "再见")]);

        let mut progress = Vec::new();
        let run = run_all(&snap, &[douyin_connection(format!("http://{addr}/webhooks/douyin"))], Duration::from_secs(2), &mut |p| progress.push(p));

        for index in 0..2 {
            let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
            let body = &snap.steps[index].body;
            assert_eq!(request.body, *body, "明文逐字节透传");
            assert_eq!(
                request.header("Content-Type").as_deref(),
                Some("application/json")
            );
            assert_eq!(
                request.header("X-Douyin-Signature"),
                Some(douyin::sign(DY_SECRET, body)),
                "签名头 = sha1hex(client_secret + 实际发送的 body)"
            );
            let msg_id = request.header("Msg-Id").expect("缺少 Msg-Id 头");
            let parts: Vec<&str> = msg_id.split('-').collect();
            assert_eq!(
                parts.iter().map(|p| p.len()).collect::<Vec<_>>(),
                vec![8, 4, 4, 4, 12],
                "Msg-Id 应为 uuid：{msg_id}"
            );
            assert_eq!(msg_id, run.steps[index].msg_id, "记录中的 Msg-Id 与请求一致");
            assert_eq!(run.steps[index].signature, douyin::sign(DY_SECRET, body));
            assert_eq!(run.steps[index].timestamp, None);
        }
    }

    /// 测试侧独立提取信封密文（朴素扫描，不复用生产实现）。
    fn naive_extract_encrypt(envelope: &str) -> &str {
        let open = "<Encrypt><![CDATA[";
        let start = envelope.find(open).expect("信封应含 Encrypt 元素") + open.len();
        let end = start + envelope[start..].find("]]>").expect("Encrypt 应有 CDATA 闭合");
        &envelope[start..end]
    }

    fn query_map(request_line: &str) -> std::collections::HashMap<String, String> {
        let url = request_line.split_whitespace().nth(1).unwrap_or_default();
        let query = url.split_once('?').map(|(_, q)| q).unwrap_or_default();
        query
            .split('&')
            .filter(|kv| !kv.is_empty())
            .map(|kv| {
                let (key, value) = kv.split_once('=').unwrap_or((kv, ""));
                (key.to_string(), value.to_string())
            })
            .collect()
    }

    #[test]
    fn wecom_run_sends_decryptable_envelopes_and_records_reply() {
        // 目标按官方语义处理：解密信封取明文、复算签名，回一个可解密的加密被动回复包
        let reply_plaintext = "<xml><Content><![CDATA[你好呀]]></Content></xml>";
        let reply_encrypt =
            wecom::encrypt_msg(WC_AES_KEY, &[3u8; 16], reply_plaintext.as_bytes(), WC_CORP_ID)
                .unwrap();
        let expected_bodies: Vec<String> = vec![
            "<xml><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[你好，企业微信]]></Content></xml>".into(),
            "<xml><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[再见]]></Content></xml>".into(),
        ];
        let responder: std::sync::Arc<
            dyn Fn(usize, &str, &str) -> (String, String) + Send + Sync,
        > = std::sync::Arc::new(move |index, line, body| {
            let ciphertext = naive_extract_encrypt(body);
            let decrypted = wecom::decrypt_msg(WC_AES_KEY, ciphertext).unwrap();
            assert_eq!(decrypted.receiveid, WC_CORP_ID, "receiveid 应为 corpid");
            assert_eq!(
                String::from_utf8(decrypted.msg).unwrap(),
                expected_bodies[index],
                "信封应解密回快照明文"
            );
            let query = query_map(line);
            let signature =
                wecom::build_signature(WC_TOKEN, &query["timestamp"], &query["nonce"], ciphertext);
            assert_eq!(signature, query["msg_signature"], "签名应可复算");
            (
                "HTTP/1.1 200 OK".to_string(),
                format!("<xml><Encrypt><![CDATA[{reply_encrypt}]]></Encrypt></xml>"),
            )
        });
        let (addr, rx) = start_serial_server(2, responder, Duration::ZERO);
        let wc_step = |name: &str, text: &str| ScenarioStepSnapshot {
            event_name: name.into(),
            event_id: format!("evt-{name}"),
            channel: "wecom".into(),
            expected: ExpectedReceipt {
                status: 200,
                body: "你好呀".into(),
                body_mode: ReceiptBodyMode::WecomReply,
            },
            body: format!(
                "<xml><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[{text}]]></Content></xml>"
            ),
        };
        let snap = snapshot("run-wc", vec![wc_step("a", "你好，企业微信"), wc_step("b", "再见")]);

        let mut progress = Vec::new();
        let run = run_all(&snap, &[wecom_connection(format!("http://{addr}/hook"))], Duration::from_secs(2), &mut |p| progress.push(p));

        for index in 0..2 {
            let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
            // 信封可独立解密回快照明文（加解密已由官方黄金例独立验证）
            let ciphertext = naive_extract_encrypt(&request.body);
            let decrypted = wecom::decrypt_msg(WC_AES_KEY, ciphertext).unwrap();
            assert_eq!(String::from_utf8(decrypted.msg).unwrap(), snap.steps[index].body);
            assert_eq!(request.header("Content-Type").as_deref(), Some("text/xml"));
            // 记录快照：签名/时间戳/nonce + 解密被动回复明文 + 企微语义结论通过
            let step = &run.steps[index];
            assert_eq!(step.channel, "wecom");
            assert!(!step.signature.is_empty());
            assert!(step.timestamp.is_some());
            assert_eq!(step.receipt.reply.as_deref(), Some(reply_plaintext));
            assert!(step.verdict.passed, "步骤 {index}：{:?}", step.verdict);
        }
    }

    #[test]
    fn unknown_channel_step_fails_without_requests() {
        let snap = snapshot(
            "run-unknown",
            vec![
                ScenarioStepSnapshot {
                    event_name: "外星渠道".into(),
                    event_id: "evt-x".into(),
                    channel: "telegram".into(),
                    expected: ExpectedReceipt {
                        status: 200,
                        body: String::new(),
                        body_mode: ReceiptBodyMode::Contains,
                    },
                    body: "{}".into(),
                },
                dy_step("b", "b"),
            ],
        );

        let mut progress = Vec::new();
        let run = run_all(&snap, &[], Duration::from_secs(1), &mut |p| progress.push(p));

        assert_eq!(run.steps[0].receipt.status, 0);
        let error = run.steps[0].receipt.error.clone().unwrap();
        assert!(error.contains("未知渠道"), "{error}");
        assert!(run.steps[1].skipped);
    }

    #[test]
    fn missing_channel_connection_fails_without_requests() {
        let snap = snapshot("run-noconn", vec![dy_step("a", "a"), dy_step("b", "b")]);

        let mut progress = Vec::new();
        let run = run_all(&snap, &[], Duration::from_secs(1), &mut |p| progress.push(p));

        let error = run.steps[0].receipt.error.clone().unwrap();
        assert!(error.contains("连接"), "应提示缺少连接配置：{error}");
        assert!(run.steps[1].skipped);
    }

    #[test]
    fn executor_output_roundtrips_through_runs_store() {
        // 步骤 1 得 500（期望 200）→ 失败即停：多步 + skipped 落盘往返
        let responder: std::sync::Arc<
            dyn Fn(usize, &str, &str) -> (String, String) + Send + Sync,
        > = std::sync::Arc::new(|_index, _line, _body| {
            ("HTTP/1.1 500 Internal Server Error".to_string(), "boom".to_string())
        });
        let (addr, _rx) = start_serial_server(1, responder, Duration::ZERO);
        let snap = snapshot("run-persist", vec![dy_step("a", "a"), dy_step("b", "b")]);

        let mut progress = Vec::new();
        let run = run_all(&snap, &[douyin_connection(format!("http://{addr}/hook"))], Duration::from_secs(2), &mut |p| progress.push(p));

        let dir = std::env::temp_dir()
            .join("mock-pulse-executor-test")
            .join(format!("persist-{}", uuid::Uuid::new_v4()));
        store::save_runs(&dir, &[run.clone()]).unwrap();
        let reloaded = store::load_runs(&dir).unwrap();
        assert_eq!(reloaded, vec![run]);
        assert!(reloaded[0].steps[1].skipped);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn progress_event_serializes_camel_case_for_frontend() {
        let event = progress_event(
            "run-1",
            None,
            &StepProgress::Finished {
                index: 2,
                step: super::super::tests::sample_run("run-1").steps[0].clone(),
                failed: false,
            },
        );
        let raw = serde_json::to_string(&event).unwrap();
        assert!(raw.contains("\"runId\""));
        assert!(raw.contains("\"status\":\"success\""));
        assert!(raw.contains("\"eventName\""));
        assert!(!raw.contains("run_id"));
        // 剧本运行没有 lane 归属：字段整体不序列化
        assert!(!raw.contains("\"lane\""));

        // 编排运行：进度带 lane 序号（camelCase），None 时仍不序列化
        let lane_event = progress_event(
            "run-1",
            Some(1),
            &StepProgress::Waiting { index: 0 },
        );
        let raw = serde_json::to_string(&lane_event).unwrap();
        assert!(raw.contains("\"lane\":1"));
        assert!(!raw.contains("\"step\""));

        let finished = RunProgressEvent {
            run_id: "run-1".into(),
            index: 1,
            status: "finished".into(),
            lane: None,
            step: None,
            run: Some(super::super::tests::sample_run("run-1")),
        };
        let raw = serde_json::to_string(&finished).unwrap();
        assert!(raw.contains("\"run\":{\"id\":\"run-1\""));
        assert!(!raw.contains("\"step\""));
        assert!(!raw.contains("\"lane\""));
    }

    // ---- 编排执行（#21）：串并行与失败策略 ----

    fn lane_snapshot(
        id: &str,
        name: &str,
        steps: Vec<ScenarioStepSnapshot>,
    ) -> ScenarioRunSnapshot {
        ScenarioRunSnapshot {
            run_id: format!("{id}-lane"),
            scenario_id: id.into(),
            scenario_name: name.into(),
            started_at: "2026-09-12T04:00:00.000Z".into(),
            steps,
        }
    }

    fn plan_snapshot(
        run_id: &str,
        mode: PlanMode,
        failure: PlanFailure,
        scenarios: Vec<ScenarioRunSnapshot>,
    ) -> PlanRunSnapshot {
        PlanRunSnapshot {
            run_id: run_id.into(),
            plan_id: "plan-1".into(),
            plan_name: "双平台接待回归".into(),
            mode,
            failure,
            started_at: "2026-09-12T04:00:00.000Z".into(),
            scenarios,
        }
    }

    /// 从请求 body 提取步骤文本（快照 body = {"event":...,"content":{"text":"xx"}}）。
    fn request_text(post: &RecordedPost) -> String {
        let start = post
            .body
            .find("\"text\":\"")
            .map(|index| index + "\"text\":\"".len())
            .unwrap_or(0);
        post.body[start..]
            .split('"')
            .next()
            .unwrap_or_default()
            .to_string()
    }

    /// two_lanes：A（3 步 a1–a3）+ B（3 步 b1–b3），同走一个抖音连接。
    fn two_lane_plan() -> PlanRunSnapshot {
        plan_snapshot(
            "run-plan",
            PlanMode::Parallel,
            PlanFailure::Continue,
            vec![
                lane_snapshot(
                    "scn-a",
                    "剧本A",
                    vec![dy_step("a1", "a1"), dy_step("a2", "a2"), dy_step("a3", "a3")],
                ),
                lane_snapshot(
                    "scn-b",
                    "剧本B",
                    vec![dy_step("b1", "b1"), dy_step("b2", "b2"), dy_step("b3", "b3")],
                ),
            ],
        )
    }

    #[test]
    fn parallel_plan_interleaves_scenarios_and_keeps_each_ordered() {
        let (addr, rx) = start_concurrent_server(
            6,
            ok_responder(),
            Duration::from_millis(120),
        );
        let snap = two_lane_plan();

        let mut progress = Vec::new();
        let run = execute_plan(
            &snap,
            &[douyin_connection(format!("http://{addr}/hook"))],
            Duration::from_secs(3),
            &mut |p| progress.push(p),
        );

        let mut requests = Vec::new();
        for _ in 0..6 {
            requests.push(rx.recv_timeout(Duration::from_secs(3)).unwrap());
        }

        // 各剧本内部 body 到达顺序 = 步骤顺序，且剧内串行（等上一步响应再发下一步）
        for (tag, expected) in [
            ("a", vec!["a1", "a2", "a3"]),
            ("b", vec!["b1", "b2", "b3"]),
        ] {
            let mut lane_requests: Vec<&RecordedPost> = requests
                .iter()
                .filter(|post| request_text(post).starts_with(tag))
                .collect();
            lane_requests.sort_by_key(|post| post.arrived_at);
            let texts: Vec<String> =
                lane_requests.iter().map(|post| request_text(post)).collect();
            assert_eq!(texts, expected, "剧本 {tag} 内应按步骤顺序到达");
            for pair in lane_requests.windows(2) {
                assert!(
                    pair[1].arrived_at >= pair[0].responded_at,
                    "剧本 {tag} 第 2 步应等第 1 步响应后再发（剧内严格有序）"
                );
            }
        }

        // 并行交错：B 的第 1 步到达早于 A 的第 1 步响应写出
        let a_first = requests
            .iter()
            .filter(|post| request_text(post) == "a1")
            .next()
            .unwrap();
        let b_first = requests
            .iter()
            .filter(|post| request_text(post) == "b1")
            .next()
            .unwrap();
        assert!(
            b_first.arrived_at < a_first.responded_at,
            "并行模式下两剧本应 T+0 同时起跑（交错到达）"
        );

        // 运行记录：source plan + planName 快照 + 步骤按 lane 顺序拼接、携带归属
        assert_eq!(run.id, "run-plan");
        assert_eq!(run.source, "plan");
        assert_eq!(run.scenario_name, None);
        assert_eq!(run.plan_name.as_deref(), Some("双平台接待回归"));
        assert_eq!(run.steps.len(), 6);
        for (index, step) in run.steps.iter().enumerate() {
            let expected_lane = if index < 3 { 0 } else { 1 };
            assert_eq!(step.lane_index, Some(expected_lane));
            assert_eq!(
                step.lane_name.as_deref(),
                Some(if expected_lane == 0 { "剧本A" } else { "剧本B" })
            );
            assert!(step.verdict.passed, "步骤 {index} 应通过");
            assert_eq!(step.event_name, snap.scenarios[expected_lane].steps[index % 3].event_name);
        }

        // 进度事件：全部带 lane 归属，无 skipped
        assert_eq!(progress.len(), 12);
        assert!(progress
            .iter()
            .all(|p| matches!(p.progress, StepProgress::Skipped { .. }) == false));
        assert!(progress.iter().all(|p| p.lane <= 1));
    }

    #[test]
    fn serial_plan_runs_scenarios_strictly_in_order() {
        let (addr, rx) = start_concurrent_server(
            6,
            ok_responder(),
            Duration::from_millis(40),
        );
        let mut snap = two_lane_plan();
        snap.mode = PlanMode::Serial;

        let mut progress = Vec::new();
        let run = execute_plan(
            &snap,
            &[douyin_connection(format!("http://{addr}/hook"))],
            Duration::from_secs(3),
            &mut |p| progress.push(p),
        );

        let mut requests = Vec::new();
        for _ in 0..6 {
            requests.push(rx.recv_timeout(Duration::from_secs(3)).unwrap());
        }
        let mut by_arrival = requests.clone();
        by_arrival.sort_by_key(|post| post.arrived_at);
        let order: Vec<String> =
            by_arrival.iter().map(|post| request_text(post)).collect();
        assert_eq!(
            order,
            vec!["a1", "a2", "a3", "b1", "b2", "b3"],
            "串行编排整体到达顺序 = 编排顺序"
        );
        // 严格顺序：前剧末步响应写出后，后剧第 1 步才到达
        let a_last = requests
            .iter()
            .find(|post| request_text(post) == "a3")
            .unwrap();
        let b_first = requests
            .iter()
            .find(|post| request_text(post) == "b1")
            .unwrap();
        assert!(
            b_first.arrived_at >= a_last.responded_at,
            "串行模式：前一剧本完全结束后才启动下一个"
        );

        assert_eq!(run.source, "plan");
        assert_eq!(run.steps.len(), 6);
        assert!(run.steps.iter().all(|step| step.verdict.passed));
        // 进度：lane 0 的全部事件先于 lane 1 的事件（串行无交错）
        let last_lane0 = progress
            .iter()
            .rposition(|p| p.lane == 0)
            .unwrap();
        assert!(progress[..last_lane0].iter().all(|p| p.lane == 0));
        assert!(progress[last_lane0 + 1..].iter().all(|p| p.lane == 1));
    }

    #[test]
    fn serial_plan_stop_skips_whole_scenarios_after_failure() {
        // A 第 2 步 500 → 失败即停：B 整体不启动，无请求发出，全 skipped
        let responder: std::sync::Arc<
            dyn Fn(usize, &str, &str) -> (String, String) + Send + Sync,
        > = std::sync::Arc::new(|_index, _line, body| {
            if body.contains("\"text\":\"boom\"") {
                (
                    "HTTP/1.1 500 Internal Server Error".to_string(),
                    "boom".to_string(),
                )
            } else {
                ("HTTP/1.1 200 OK".to_string(), "ok".to_string())
            }
        });
        let (addr, rx) =
            start_concurrent_server(2, responder, Duration::ZERO);
        let snap = plan_snapshot(
            "run-plan-stop",
            PlanMode::Serial,
            PlanFailure::Stop,
            vec![
                lane_snapshot(
                    "scn-a",
                    "剧本A",
                    vec![dy_step("a1", "ok"), dy_step("a2", "boom")],
                ),
                lane_snapshot(
                    "scn-b",
                    "剧本B",
                    vec![dy_step("b1", "b1"), dy_step("b2", "b2")],
                ),
            ],
        );

        let mut progress = Vec::new();
        let run = execute_plan(
            &snap,
            &[douyin_connection(format!("http://{addr}/hook"))],
            Duration::from_secs(2),
            &mut |p| progress.push(p),
        );

        // 失败剧本之后的剧本不发请求（只有 A 的两步到达）
        let mut seen = 0;
        while let Ok(_post) = rx.recv_timeout(Duration::from_millis(300)) {
            seen += 1;
        }
        assert_eq!(seen, 2, "失败即停：后续剧本不应发请求");

        // 记录：步骤按 lane 拼接，B 的步骤全 skipped + 剧本级原因
        assert_eq!(run.steps.len(), 4);
        assert!(run.steps[0].verdict.passed);
        assert!(!run.steps[1].verdict.passed);
        assert!(!run.steps[1].skipped);
        for step in &run.steps[2..] {
            assert!(step.skipped);
            assert!(
                step.verdict.reason.contains("前序剧本失败"),
                "未启动剧本的结论应指明原因：{}",
                step.verdict.reason
            );
            assert_eq!(step.receipt.status, 0);
            assert_eq!(step.signature, "");
            assert_eq!(step.lane_index, Some(1));
            assert_eq!(step.lane_name.as_deref(), Some("剧本B"));
        }

        // 进度：lane 1 只发 skipped 事件
        let lane1: Vec<&LaneProgress> =
            progress.iter().filter(|p| p.lane == 1).collect();
        assert_eq!(lane1.len(), 2);
        assert!(lane1
            .iter()
            .all(|p| matches!(p.progress, StepProgress::Skipped { .. })));
    }

    #[test]
    fn serial_plan_continue_finishes_all_scenarios() {
        // A 首步即失败；failure=continue → B 仍完整执行（剧内失败即停语义不变）
        let responder: std::sync::Arc<
            dyn Fn(usize, &str, &str) -> (String, String) + Send + Sync,
        > = std::sync::Arc::new(|_index, _line, body| {
            if body.contains("\"text\":\"boom\"") {
                (
                    "HTTP/1.1 500 Internal Server Error".to_string(),
                    "boom".to_string(),
                )
            } else {
                ("HTTP/1.1 200 OK".to_string(), "ok".to_string())
            }
        });
        let (addr, rx) =
            start_concurrent_server(3, responder, Duration::ZERO);
        let snap = plan_snapshot(
            "run-plan-continue",
            PlanMode::Serial,
            PlanFailure::Continue,
            vec![
                lane_snapshot("scn-a", "剧本A", vec![dy_step("a1", "boom")]),
                lane_snapshot(
                    "scn-b",
                    "剧本B",
                    vec![dy_step("b1", "b1"), dy_step("b2", "b2")],
                ),
            ],
        );

        let mut progress = Vec::new();
        let run = execute_plan(
            &snap,
            &[douyin_connection(format!("http://{addr}/hook"))],
            Duration::from_secs(2),
            &mut |p| progress.push(p),
        );

        // 全部剧本执行完毕：3 个请求都到达
        let mut seen = 0;
        while let Ok(_post) = rx.recv_timeout(Duration::from_millis(300)) {
            seen += 1;
        }
        assert_eq!(seen, 3, "记录后继续：失败后其余剧本仍全部执行");

        assert_eq!(run.steps.len(), 3);
        assert!(!run.steps[0].verdict.passed);
        assert_eq!(run.steps[0].lane_index, Some(0));
        assert!(run.steps[1].verdict.passed && !run.steps[1].skipped);
        assert!(run.steps[2].verdict.passed && !run.steps[2].skipped);
        assert_eq!(run.steps[1].lane_index, Some(1));
        assert_eq!(run.steps[2].lane_index, Some(1));
    }

    #[test]
    fn parallel_plan_stop_halts_other_scenarios_after_failure() {
        // A 首步快返回 500；B 长链路（每步慢响应）→ B 除在途步外后续 skipped
        let responder: std::sync::Arc<
            dyn Fn(usize, &str, &str) -> (String, String) + Send + Sync,
        > = std::sync::Arc::new(|_index, _line, body| {
            if body.contains("\"text\":\"boom\"") {
                (
                    "HTTP/1.1 500 Internal Server Error".to_string(),
                    "boom".to_string(),
                )
            } else {
                // 慢响应：为 B 制造在途窗口（A 在此期间失败置位取消旗标）
                std::thread::sleep(Duration::from_millis(150));
                ("HTTP/1.1 200 OK".to_string(), "ok".to_string())
            }
        });
        let (addr, rx) =
            start_concurrent_server(2, responder, Duration::ZERO);
        let snap = plan_snapshot(
            "run-plan-parallel-stop",
            PlanMode::Parallel,
            PlanFailure::Stop,
            vec![
                lane_snapshot("scn-a", "剧本A", vec![dy_step("a1", "boom")]),
                lane_snapshot(
                    "scn-b",
                    "剧本B",
                    vec![dy_step("b1", "b1"), dy_step("b2", "b2"), dy_step("b3", "b3")],
                ),
            ],
        );

        let mut progress = Vec::new();
        let run = execute_plan(
            &snap,
            &[douyin_connection(format!("http://{addr}/hook"))],
            Duration::from_secs(3),
            &mut |p| progress.push(p),
        );

        // 只有 A 的失败步与 B 的在途步发出请求
        let mut seen = Vec::new();
        while let Ok(post) = rx.recv_timeout(Duration::from_millis(300)) {
            seen.push(request_text(&post));
        }
        seen.sort();
        assert_eq!(
            seen,
            vec!["b1", "boom"],
            "取消旗标后不应再启动 B 的后续步骤"
        );

        // B 的在途步自然完成（通过），后续步骤 skipped
        assert_eq!(run.steps.len(), 4);
        assert!(!run.steps[0].verdict.passed, "A 失败步");
        assert_eq!(run.steps[0].lane_index, Some(0));
        assert!(run.steps[1].verdict.passed, "B 的在途步应自然完成");
        assert!(!run.steps[1].skipped);
        assert_eq!(run.steps[1].lane_index, Some(1));
        for step in &run.steps[2..] {
            assert!(step.skipped);
            assert!(
                step.verdict.reason.contains("编排停止"),
                "并行取消的结论应指明编排停止：{}",
                step.verdict.reason
            );
            assert_eq!(step.lane_index, Some(1));
            assert_eq!(step.lane_name.as_deref(), Some("剧本B"));
        }
    }

    #[test]
    fn parallel_plan_continue_ignores_other_lane_failures() {
        // failure=continue：A 快失败不拦 B——B 长链路应跑完所有步骤
        let responder: std::sync::Arc<
            dyn Fn(usize, &str, &str) -> (String, String) + Send + Sync,
        > = std::sync::Arc::new(|_index, _line, body| {
            if body.contains("\"text\":\"boom\"") {
                (
                    "HTTP/1.1 500 Internal Server Error".to_string(),
                    "boom".to_string(),
                )
            } else {
                std::thread::sleep(Duration::from_millis(30));
                ("HTTP/1.1 200 OK".to_string(), "ok".to_string())
            }
        });
        let (addr, rx) =
            start_concurrent_server(4, responder, Duration::ZERO);
        let snap = plan_snapshot(
            "run-plan-parallel-continue",
            PlanMode::Parallel,
            PlanFailure::Continue,
            vec![
                lane_snapshot("scn-a", "剧本A", vec![dy_step("a1", "boom")]),
                lane_snapshot(
                    "scn-b",
                    "剧本B",
                    vec![dy_step("b1", "b1"), dy_step("b2", "b2"), dy_step("b3", "b3")],
                ),
            ],
        );

        let mut progress = Vec::new();
        let run = execute_plan(
            &snap,
            &[douyin_connection(format!("http://{addr}/hook"))],
            Duration::from_secs(3),
            &mut |p| progress.push(p),
        );

        // A 1 个请求（文本 boom）+ B 全部 3 个请求
        let mut seen = Vec::new();
        while let Ok(post) = rx.recv_timeout(Duration::from_millis(300)) {
            seen.push(request_text(&post));
        }
        seen.sort();
        assert_eq!(seen, vec!["b1", "b2", "b3", "boom"]);

        assert_eq!(run.steps.len(), 4);
        assert!(!run.steps[0].verdict.passed);
        assert!(run.steps[1..].iter().all(|step| step.verdict.passed));
        assert!(run.steps[1..].iter().all(|step| !step.skipped));
    }
}
