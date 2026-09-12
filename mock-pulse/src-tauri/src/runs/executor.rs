//! 剧本执行器：接收前端物化好的「运行快照」（纯数据：每步的渠道、事件名、
//! 期望回执、拼装好的明文载荷）+ 各渠道连接配置，串行执行步骤——
//! 每步按渠道路由到既有协议原语（抖音 sha1 签名 JSON POST / 企微 AES 信封
//! XML POST，复用 connections::dispatch_event，不复制协议代码），经进度回调
//! 实时回报每步状态（等待/成功/失败），失败即停（后续步骤记 skipped），
//! 结束后组装 RunRecord。Rust 不感知素材库/剧本概念，只执行快照。

use std::time::Duration;

use serde::Serialize;
use tauri::Manager;

use crate::connections::douyin;
use crate::connections::wecom;
use crate::connections::ConnectionConfig;

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

/// run-progress 事件载荷（camelCase，与前端 slice 的 onRunProgress 对齐）。
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RunProgressEvent {
    pub run_id: String,
    pub index: usize,
    /// waiting | success | failed | skipped | finished
    pub status: String,
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
    let mut steps: Vec<RunStep> = Vec::with_capacity(snapshot.steps.len());
    let mut failed_index: Option<usize> = None;
    for (index, step_snapshot) in snapshot.steps.iter().enumerate() {
        if failed_index.is_some() {
            // 失败即停（#21 扩展并行与继续策略）：后续步骤不发请求，记 skipped
            on_progress(StepProgress::Skipped { index });
            steps.push(skipped_step(step_snapshot, connections));
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
            failed_index = Some(index);
        }
        steps.push(step);
    }
    RunRecord {
        id: snapshot.run_id.clone(),
        started_at: snapshot.started_at.clone(),
        source: "scenario".into(),
        scenario_name: Some(snapshot.scenario_name.clone()),
        steps,
    }
}

/// 未执行的步骤快照（保留事件名/载荷等快照事实，标记 skipped）。
fn skipped_step(
    step: &ScenarioStepSnapshot,
    connections: &[ConnectionConfig],
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
            reason: "前序步骤失败，本步骤未执行".into(),
        },
        skipped: true,
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
            }
        }
        other => {
            failed_without_send(step, format!("未知渠道：{other}，无法执行步骤"))
        }
    }
}

/// 把 StepProgress 转成 run-progress 事件载荷。
fn progress_event(run_id: &str, progress: &StepProgress) -> RunProgressEvent {
    match progress {
        StepProgress::Waiting { index } => RunProgressEvent {
            run_id: run_id.into(),
            index: *index,
            status: "waiting".into(),
            step: None,
            run: None,
        },
        StepProgress::Finished { index, step, failed } => RunProgressEvent {
            run_id: run_id.into(),
            index: *index,
            status: if *failed { "failed" } else { "success" }.into(),
            step: Some(step.clone()),
            run: None,
        },
        StepProgress::Skipped { index } => RunProgressEvent {
            run_id: run_id.into(),
            index: *index,
            status: "skipped".into(),
            step: None,
            run: None,
        },
    }
}

/// 后台执行：进度经 run-progress 事件回报，完成后运行记录落 runs.json，
/// 并发一条 finished 事件携带完整记录（前端入列）。
fn run_in_background(
    app: tauri::AppHandle,
    snapshot: ScenarioRunSnapshot,
    connections: Vec<ConnectionConfig>,
) {
    use tauri::Emitter;

    let run_id = snapshot.run_id.clone();
    let mut on_progress = |progress: StepProgress| {
        let _ = app.emit("run-progress", progress_event(&run_id, &progress));
    };
    let run = execute_snapshot(
        &snapshot,
        &connections,
        Duration::from_secs(5),
        &mut on_progress,
    );
    // 运行记录落盘（失败仅忽略：记录仍随 finished 事件进入前端列表）
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

        let finished = RunProgressEvent {
            run_id: "run-1".into(),
            index: 1,
            status: "finished".into(),
            step: None,
            run: Some(super::super::tests::sample_run("run-1")),
        };
        let raw = serde_json::to_string(&finished).unwrap();
        assert!(raw.contains("\"run\":{\"id\":\"run-1\""));
        assert!(!raw.contains("\"step\""));
    }
}
