//! 剧本/编排执行器：接收前端物化好的「运行快照」（见 `super::snapshot`）+
//! 各渠道连接配置，串行执行步骤——每步经 connections 适配器注册表路由到
//! 渠道协议原语（协议差异留在 adapter 实现内，不复制协议代码），经进度回调
//! （见 `super::progress`）实时回报每步状态（等待/成功/失败），结束后组装
//! RunRecord。Rust 不感知素材库/剧本概念，只执行快照。
//!
//! 编排（#21）：serial = 逐剧本完整执行（前剧结束才启下一剧，可选失败即停）；
//! parallel = 每剧本一线程 T+0 同时起跑、剧内严格有序（ADR-0004 并发语义），
//! 失败即停用共享取消旗标承载——任一剧本失败置位，各剧本每步启动前检查
//! （在途步骤自然完成）。
//! 失败策略显式化（批 3a）：「跳不跳、为何跳」收敛为 `policy::LanePolicy`
//! 决策表单点裁决，serial/parallel 编织函数只负责喂策略，不再各自解读旗标。
//! 本文件是编排编织内核（只认 `PlanRunSnapshot`）+ 检查点步骤回写单点
//! （[`write_checkpoint_step`] = [`patch_checkpoint_step`] 定位覆盖 +
//! 注入落盘）：「记录内步骤下标 = 按 lane 顺序拼接」这条契约的拼装与
//! 增量回写两半同住此处。剧本运行 = 单 lane 编排，
//! 包装与形态退化在命令边界（`commands::solo_plan` / `scenario_shape`）；
//! 快照类型/校验在 `super::snapshot`，run-progress 事件与 emit 侧在
//! `super::progress`，命令接线与后台执行在子模块 `commands`。

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::connections::{
    adapter_by_channel, client_with_timeout, ConnectionConfig, DispatchOutcome,
};
use crate::plans::{PlanFailure, PlanMode};

use super::policy::{LanePolicy, SkipReason, StepDecision};
use super::progress::{LaneProgress, StepProgress};
use super::snapshot::{PlanRunSnapshot, ScenarioRunSnapshot, ScenarioStepSnapshot};
use super::{sent_step, skipped_step, RunRecord, RunStep, StepFacts};

/// 单 lane（剧本）执行：每步 waiting → 发送 → 比对 → finished。
/// 「跳不跳、为何跳」全部交由 [`LanePolicy`] 决策表裁决（见 `super::policy`）：
/// 本函数只负责喂停止信号、执行与记账。返回（步骤记录, 本剧本是否有失败步骤）。
fn execute_lane_steps<F: FnMut(StepProgress)>(
    snapshot: &ScenarioRunSnapshot,
    connections: &[ConnectionConfig],
    timeout: Duration,
    mut policy: LanePolicy<'_>,
    on_progress: &mut F,
) -> (Vec<RunStep>, bool) {
    let mut steps: Vec<RunStep> = Vec::with_capacity(snapshot.steps.len());
    for (index, step_snapshot) in snapshot.steps.iter().enumerate() {
        if let StepDecision::Skip(reason) = policy.decide() {
            on_progress(StepProgress::Skipped { index });
            steps.push(skipped_step(
                Some(&step_snapshot.expected),
                step_facts(step_snapshot, connections),
                reason.text(),
            ));
            continue;
        }
        on_progress(StepProgress::Waiting { index });
        let seconds = step_snapshot.wait.unwrap_or(0.0);
        let seconds = if seconds.is_finite() {
            seconds.clamp(0.0, 60.0)
        } else {
            0.0
        };
        let until = Instant::now() + Duration::from_secs_f64(seconds);
        while Instant::now() < until && !policy.stopped_during_wait() {
            std::thread::sleep(
                until
                    .saturating_duration_since(Instant::now())
                    .min(Duration::from_millis(10)),
            );
        }
        if policy.stopped_during_wait() {
            on_progress(StepProgress::Skipped { index });
            steps.push(skipped_step(
                Some(&step_snapshot.expected),
                step_facts(step_snapshot, connections),
                SkipReason::RunStopped.text(),
            ));
            continue;
        }
        let step = execute_step(step_snapshot, connections, timeout);
        let failed = step.receipt.error.is_some() || !step.verdict.passed;
        on_progress(StepProgress::Finished {
            index,
            step: step.clone(),
            failed,
        });
        if failed {
            policy.note_failure();
        }
        steps.push(step);
    }
    (steps, policy.own_failed())
}

/// 给步骤打 lane 归属（编排运行记录：步骤按 lane 顺序拼接，各步携带归属）。
fn tag_lane(mut step: RunStep, lane: usize, scenario_name: &str) -> RunStep {
    step.lane_index = Some(lane);
    step.lane_name = Some(scenario_name.into());
    step
}

/// 运行检查点的步骤回执补丁（runs 域单点）：把「lane 内步骤下标」定位为
/// 运行记录内的平铺下标并回执覆盖。记录内步骤下标 = 前 lane 步数前缀和，
/// 与串行/并行编织（下方两编织函数的 lane 顺序 extend）及中断检查点构造
/// （`commands::interrupted_plan_record` 的同序 flat_map）同一条拼接契约；
/// 偏移从记录自身的 lane 归属推导（归属 lane 序号小于本 lane 的步骤数），
/// 不再依赖快照重算。槽位归属（lane 序号 + 剧本名；剧本形态为 None）原样
/// 保留——归属在检查点构造时已由 [`tag_lane`] 定死，单 lane 剧本形态自然
/// 退化，本函数不解读运行形态。纯函数：只改内存记录，落盘由调用方注入
/// （见 `commands.rs` 的回执覆盖路径）。
fn patch_checkpoint_step(
    record: &mut RunRecord,
    lane: usize,
    index: usize,
    mut step: RunStep,
) {
    let offset = record
        .steps
        .iter()
        .filter(|placed| placed.lane_index.is_some_and(|placed_lane| placed_lane < lane))
        .count();
    let slot = &mut record.steps[offset + index];
    step.lane_index = slot.lane_index;
    step.lane_name = slot.lane_name.take();
    *slot = step;
}

/// 检查点回执回写（组合操作，runs 域单点）：[`patch_checkpoint_step`] 定位
/// 覆盖后，经注入的 persist 携带已补丁记录全量落盘。persist 在命令边界注入
/// （生产侧 = `store::upsert_run` + 错误映射，内核不感知存储），落盘失败
/// 以 `Err` 原样上抛——调用方装进 run-progress 事件的 error，回执不静默丢失。
fn write_checkpoint_step<P>(
    record: &mut RunRecord,
    lane: usize,
    index: usize,
    step: RunStep,
    persist: P,
) -> Result<(), String>
where
    P: FnOnce(RunRecord) -> Result<(), String>,
{
    patch_checkpoint_step(record, lane, index, step);
    persist(record.clone())
}

/// 编排执行（#21）：serial 按序逐剧本完整执行；parallel 每剧本一线程
/// T+0 同时起跑、剧内严格有序。失败策略：
/// - stop = 任一剧本失败即停整个编排（后续剧本不启动 / 并行下后续步骤不启动）；
/// - continue = 记录后继续，全部剧本执行完毕（剧内失败即停语义不变）。
/// 步骤按 lane 顺序拼接入运行记录。进度回调带 lane 序号。
#[cfg(test)]
pub fn execute_plan<F>(
    snapshot: &PlanRunSnapshot,
    connections: &[ConnectionConfig],
    timeout: Duration,
    on_progress: &mut F,
) -> RunRecord
where
    F: FnMut(LaneProgress) + Send,
{
    execute_plan_cancellable(
        snapshot,
        connections,
        timeout,
        &AtomicBool::new(false),
        on_progress,
    )
}

fn execute_plan_cancellable<F>(
    snapshot: &PlanRunSnapshot,
    connections: &[ConnectionConfig],
    timeout: Duration,
    user_cancel: &AtomicBool,
    on_progress: &mut F,
) -> RunRecord
where
    F: FnMut(LaneProgress) + Send,
{
    let steps = match snapshot.mode {
        PlanMode::Serial => {
            execute_plan_serial(snapshot, connections, timeout, user_cancel, on_progress)
        }
        PlanMode::Parallel => {
            execute_plan_parallel(snapshot, connections, timeout, user_cancel, on_progress)
        }
    };
    RunRecord {
        id: snapshot.run_id.clone(),
        started_at: snapshot.started_at.clone(),
        source: "plan".into(),
        scenario_name: None,
        plan_name: Some(snapshot.plan_name.clone()),
        mode: Some(snapshot.mode),
        source_id: Some(snapshot.plan_id.clone()),
        cancelled: user_cancel.load(Ordering::SeqCst),
        steps,
    }
}

/// 串行编排：前剧完全结束才启下一剧；失败即停下未启动的剧本以
/// [`LanePolicy::serial`] 的 halt 种子整体记 skipped（前序剧本失败）。
/// 失败传播走 execute_lane_steps 返回的 own_failed → 下一剧的
/// previous_failed——不设取消旗标，本剧失败不泄漏为后续剧本的取消信号。
fn execute_plan_serial<F: FnMut(LaneProgress)>(
    snapshot: &PlanRunSnapshot,
    connections: &[ConnectionConfig],
    timeout: Duration,
    user_cancel: &AtomicBool,
    on_progress: &mut F,
) -> Vec<RunStep> {
    let mut previous_failed = false;
    let mut all_steps = Vec::new();
    for (lane, scenario) in snapshot.scenarios.iter().enumerate() {
        let policy = LanePolicy::serial(snapshot.failure, scenario, user_cancel, previous_failed);
        let (steps, failed) = execute_lane_steps(
            scenario,
            connections,
            timeout,
            policy,
            &mut |progress: StepProgress| {
                on_progress(LaneProgress { lane, progress });
            },
        );
        all_steps.extend(
            steps
                .into_iter()
                .map(|step| tag_lane(step, lane, &scenario.scenario_name)),
        );
        previous_failed |= failed;
    }
    all_steps
}

/// 并行编排：每剧本一线程同时启动（T+0 起跑），剧内步骤严格串行。
/// 失败即停的编排停止由共享取消旗标承载——本剧失败经
/// [`LanePolicy::note_failure`] 置位（Relaxed），其余剧本经决策表锁存
/// 「编排停止」（在途步骤自然完成）；continue 时策略不持旗标，
/// 各剧各跑到底（剧内失败即停语义不变）。
/// lane 线程 panic 不引爆宿主线程（join expect 曾让 finished 事件永不
/// 发出、RunSession 全局互斥永久占用）：join Err 折叠为该剧本剩余步骤的
/// 失败回执（[`SkipReason::LanePanicked`]，已完成步骤经台账原样保留），
/// 编排照常走既有收尾（finished 事件 / 落盘 / 控制注册表释放随命令边界照旧）。
fn execute_plan_parallel<F>(
    snapshot: &PlanRunSnapshot,
    connections: &[ConnectionConfig],
    timeout: Duration,
    user_cancel: &AtomicBool,
    on_progress: &mut F,
) -> Vec<RunStep>
where
    F: FnMut(LaneProgress) + Send,
{
    let shared_cancel =
        (snapshot.failure == PlanFailure::Stop).then(|| Arc::new(AtomicBool::new(false)));
    // 并发 lane 共享一个进度回调（FnMut 需互斥；锁毒化视为不可恢复错误）
    let sink = Mutex::new(on_progress);
    // 每 lane 台账：已落 Finished 进度事件的步骤快照（事件自带完整快照，
    // 先于回调记账）。lane 线程 panic 时返回值随线程丢失，已完成步骤据此
    // 回填，剩余步骤折叠为失败回执。
    let placed: Vec<Mutex<Vec<Option<RunStep>>>> = snapshot
        .scenarios
        .iter()
        .map(|scenario| Mutex::new(vec![None; scenario.steps.len()]))
        .collect();
    // scoped 线程：快照与连接都是本函数栈上借用，无需 'static
    let outcomes: Vec<(Vec<RunStep>, bool)> = std::thread::scope(|scope| {
        let handles: Vec<_> = snapshot
            .scenarios
            .iter()
            .enumerate()
            .map(|(lane, scenario)| {
                let shared = shared_cancel.as_deref();
                let sink = &sink;
                let placed = &placed;
                scope.spawn(move || {
                    let mut on_lane = |progress: StepProgress| {
                        if let StepProgress::Finished { index, step, .. } = &progress {
                            let mut slots = placed[lane]
                                .lock()
                                .unwrap_or_else(|poisoned| poisoned.into_inner());
                            slots[*index] = Some(step.clone());
                        }
                        let mut guard =
                            sink.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                        guard(LaneProgress { lane, progress });
                    };
                    let policy =
                        LanePolicy::parallel(snapshot.failure, scenario, user_cancel, shared);
                    execute_lane_steps(scenario, connections, timeout, policy, &mut on_lane)
                })
            })
            .collect();
        // join Err = lane 线程 panic：折叠为该 lane 剩余步骤的失败回执后照常
        // 收尾（逐 handle join 消费 panic 载荷，scope 不再向宿主线程传播）
        handles
            .into_iter()
            .enumerate()
            .map(|(lane, handle)| match handle.join() {
                Ok(outcome) => outcome,
                Err(_payload) => {
                    let slots = placed[lane]
                        .lock()
                        .unwrap_or_else(|poisoned| poisoned.into_inner());
                    recover_panicked_lane(&snapshot.scenarios[lane], connections, &slots)
                }
            })
            .collect()
    });
    // 记录按 lane 顺序拼接（与完成先后无关）
    let mut all_steps = Vec::new();
    for (lane, (steps, _)) in outcomes.into_iter().enumerate() {
        let name = &snapshot.scenarios[lane].scenario_name;
        all_steps.extend(steps.into_iter().map(|step| tag_lane(step, lane, name)));
    }
    all_steps
}

/// lane 线程 panic 的兜底折叠（join Err 收口）：台账中已完成的步骤原样
/// 保留，其余步骤全部折叠为 [`SkipReason::LanePanicked`] 失败回执——该
/// lane 槽位齐全，「记录内步骤下标 = 按 lane 顺序拼接」的检查点回写契约
/// 不破，并记 own_failed（剧本确实未跑完）。
fn recover_panicked_lane(
    scenario: &ScenarioRunSnapshot,
    connections: &[ConnectionConfig],
    placed: &[Option<RunStep>],
) -> (Vec<RunStep>, bool) {
    let steps = scenario
        .steps
        .iter()
        .enumerate()
        .map(|(index, step_snapshot)| match placed.get(index) {
            Some(Some(step)) => step.clone(),
            _ => skipped_step(
                Some(&step_snapshot.expected),
                step_facts(step_snapshot, connections),
                SkipReason::LanePanicked.text(),
            ),
        })
        .collect();
    (steps, true)
}

/// 步骤快照 → 身份事实（未发出请求的路径：url 按渠道连接解析，缺失记空串）。
fn step_facts(step: &ScenarioStepSnapshot, connections: &[ConnectionConfig]) -> StepFacts {
    StepFacts {
        event_name: step.event_name.clone(),
        event_id: step.event_id.clone(),
        channel: step.channel.clone(),
        url: channel_url(&step.channel, connections).unwrap_or_default(),
        payload: step.body.clone(),
    }
}

/// 按渠道取连接配置里的目标地址（连接缺失/未知渠道时 None）。
fn channel_url(channel: &str, connections: &[ConnectionConfig]) -> Option<String> {
    let adapter = adapter_by_channel(channel)?;
    connections
        .iter()
        .find(|config| adapter.matches(config))
        .and_then(|config| adapter.url(config))
        .map(str::to_string)
}

/// 未发出请求即失败的步骤（连接缺失/未知渠道）：结论按期望回执比对推导。
fn failed_without_send(step: &ScenarioStepSnapshot, error: String) -> RunStep {
    sent_step(
        Some(&step.expected),
        StepFacts {
            event_name: step.event_name.clone(),
            event_id: step.event_id.clone(),
            channel: step.channel.clone(),
            url: String::new(),
            payload: step.body.clone(),
        },
        DispatchOutcome::not_sent(error),
    )
}

/// 单步执行：经注册表路由到渠道 adapter（协议差异留在 adapter 实现内）；
/// 连接缺失/未知渠道直接判失败（不发请求）。超时/连接失败由客户端内建超时承载。
fn execute_step(
    step: &ScenarioStepSnapshot,
    connections: &[ConnectionConfig],
    timeout: Duration,
) -> RunStep {
    let Some(adapter) = adapter_by_channel(&step.channel) else {
        return failed_without_send(step, format!("未知渠道：{}，无法执行步骤", step.channel));
    };
    let Some(config) = connections.iter().find(|config| adapter.matches(config)) else {
        return failed_without_send(
            step,
            format!("缺少{}渠道连接配置，无法执行步骤", adapter.label()),
        );
    };
    let outcome = adapter.dispatch_event(&client_with_timeout(timeout), config, &step.body);
    sent_step(
        Some(&step.expected),
        StepFacts {
            event_name: step.event_name.clone(),
            event_id: step.event_id.clone(),
            channel: adapter.id().into(),
            url: adapter.url(config).unwrap_or_default().into(),
            payload: step.body.clone(),
        },
        outcome,
    )
}

/// 命令接线与后台执行（进度 emit / 落盘收尾 / 中断检查点）单点在 commands；
/// lib.rs 的 generate_handler 以 runs::executor::commands:: 路径取用
/// （tauri 命令宏的隐藏产物须随定义模块解析，故模块对 crate 根可见）。
pub mod commands;

#[cfg(test)]
mod tests;
