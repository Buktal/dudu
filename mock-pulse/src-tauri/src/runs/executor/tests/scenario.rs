//! 单剧本（serial）执行全链路：顺序/失败即停/超时/抖音签名/企微加密信封/
//! 未知渠道与缺连接，及执行产物落盘往返。

use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::connections::{douyin, wecom};
use crate::runs::progress::StepProgress;
use crate::runs::snapshot::ScenarioRunSnapshot;
use crate::runs::store;
use crate::runs::verdict::{ExpectedReceipt, ReceiptBodyMode};
use crate::runs::{RunRecord, RunStep};
use crate::test_support::{
    ok_responder, start_serial_server, RecordedPost, Responder,
};

use super::*;

fn run_all<F: FnMut(StepProgress) + Send>(
    snapshot: &ScenarioRunSnapshot,
    connections: &[crate::connections::ConnectionConfig],
    timeout: Duration,
    on_progress: &mut F,
) -> RunRecord {
    super::run_scenario_cancellable(
        snapshot,
        connections,
        timeout,
        &AtomicBool::new(false),
        on_progress,
    )
}

#[test]
fn executes_steps_in_serial_order_and_records_all_pass() {
    let bodies = ["第一步", "第二步", "第三步"];
    let (addr, rx) = start_serial_server(3, ok_responder(), Duration::ZERO);
    let snap = snapshot(
        "run-serial",
        bodies.iter().map(|text| dy_step(text, text)).collect(),
    );

    let mut progress = Vec::new();
    let run = run_all(
        &snap,
        &[douyin_connection(format!("http://{addr}/hook"))],
        Duration::from_secs(2),
        &mut |p| progress.push(p),
    );

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
                if *failed {
                    "failed"
                } else {
                    "success"
                }
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
    let responder: Responder = Arc::new(|index, _line, _body| {
        if index == 1 {
            (
                "HTTP/1.1 500 Internal Server Error".to_string(),
                "boom".to_string(),
            )
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
    let run = run_all(
        &snap,
        &[douyin_connection(format!("http://{addr}/hook"))],
        Duration::from_secs(2),
        &mut |p| progress.push(p),
    );

    // 只有前两步发出请求
    let mut seen = 0;
    while let Ok(_request) = rx.recv_timeout(Duration::from_millis(300)) {
        seen += 1;
    }
    assert_eq!(seen, 2, "失败后不应再有请求");

    // 进度：waiting(0) success(0) → waiting(1) failed(1) → skipped(2)
    assert!(matches!(progress[0], StepProgress::Waiting { index: 0 }));
    assert!(matches!(
        &progress[1],
        StepProgress::Finished {
            index: 0,
            failed: false,
            ..
        }
    ));
    assert!(matches!(progress[2], StepProgress::Waiting { index: 1 }));
    assert!(matches!(
        &progress[3],
        StepProgress::Finished {
            index: 1,
            failed: true,
            ..
        }
    ));
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
    let snap = snapshot("run-timeout", vec![dy_step("a", "a"), dy_step("b", "b")]);

    let started = Instant::now();
    let mut progress = Vec::new();
    let run = run_all(
        &snap,
        &[douyin_connection(format!("http://{addr}/hook"))],
        Duration::from_millis(200),
        &mut |p| progress.push(p),
    );

    assert!(
        started.elapsed() < Duration::from_secs(1),
        "应按超时上限提前结束"
    );
    assert_eq!(run.steps[0].receipt.status, 0, "未收到响应");
    assert!(run.steps[0]
        .receipt
        .error
        .as_deref()
        .unwrap_or_default()
        .contains("超时"));
    assert!(!run.steps[0].verdict.passed);
    assert!(run.steps[1].skipped);
    assert!(matches!(
        &progress[1],
        StepProgress::Finished {
            index: 0,
            failed: true,
            ..
        }
    ));
}

#[test]
fn douyin_run_signs_each_request_officially() {
    let (addr, rx) = start_serial_server(2, ok_responder(), Duration::ZERO);
    let snap = snapshot(
        "run-dy",
        vec![dy_step("a", "你好，抖音"), dy_step("b", "再见")],
    );

    let mut progress = Vec::new();
    let run = run_all(
        &snap,
        &[douyin_connection(format!("http://{addr}/webhooks/douyin"))],
        Duration::from_secs(2),
        &mut |p| progress.push(p),
    );

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
        assert_eq!(
            msg_id, run.steps[index].msg_id,
            "记录中的 Msg-Id 与请求一致"
        );
        assert_eq!(run.steps[index].signature, douyin::sign(DY_SECRET, body));
        assert_eq!(run.steps[index].timestamp, None);
    }
}

/// 测试侧独立提取信封密文（朴素扫描，不复用生产实现）。
fn naive_extract_encrypt(envelope: &str) -> &str {
    let open = "<Encrypt><![CDATA[";
    let start = envelope.find(open).expect("信封应含 Encrypt 元素") + open.len();
    let end = start
        + envelope[start..]
            .find("]]>")
            .expect("Encrypt 应有 CDATA 闭合");
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
    let responder: Responder = Arc::new(move |index, line, body| {
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
    let wc_step = |name: &str, text: &str| {
        ScenarioStepSnapshot {
            wait: None,
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
        }
    };
    let snap = snapshot(
        "run-wc",
        vec![wc_step("a", "你好，企业微信"), wc_step("b", "再见")],
    );

    let mut progress = Vec::new();
    let run = run_all(
        &snap,
        &[wecom_connection(format!("http://{addr}/hook"))],
        Duration::from_secs(2),
        &mut |p| progress.push(p),
    );

    for index in 0..2 {
        let request: RecordedPost = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        // 信封可独立解密回快照明文（加解密已由官方黄金例独立验证）
        let ciphertext = naive_extract_encrypt(&request.body);
        let decrypted = wecom::decrypt_msg(WC_AES_KEY, ciphertext).unwrap();
        assert_eq!(
            String::from_utf8(decrypted.msg).unwrap(),
            snap.steps[index].body
        );
        assert_eq!(request.header("Content-Type").as_deref(), Some("text/xml"));
        // 记录快照：签名/时间戳/nonce + 解密被动回复明文 + 企微语义结论通过
        let step: &RunStep = &run.steps[index];
        assert_eq!(step.channel, "wecom");
        assert_eq!(step.request_body.as_deref(), Some(request.body.as_str()));
        assert_eq!(step.expected.as_ref(), Some(&snap.steps[index].expected));
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
                wait: None,
                event_name: "外星渠道".into(),
                event_id: "evt-x".into(),
                // 样例取注册表外 id：知乎无推送不入表，事实库结论
                channel: "zhihu".into(),
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
    let run = run_all(&snap, &[], Duration::from_secs(1), &mut |p| {
        progress.push(p)
    });

    assert_eq!(run.steps[0].receipt.status, 0);
    let error = run.steps[0].receipt.error.clone().unwrap();
    assert!(error.contains("未知渠道"), "{error}");
    assert!(run.steps[1].skipped);
}

#[test]
fn missing_channel_connection_fails_without_requests() {
    let snap = snapshot("run-noconn", vec![dy_step("a", "a"), dy_step("b", "b")]);

    let mut progress = Vec::new();
    let run = run_all(&snap, &[], Duration::from_secs(1), &mut |p| {
        progress.push(p)
    });

    let error = run.steps[0].receipt.error.clone().unwrap();
    assert!(error.contains("连接"), "应提示缺少连接配置：{error}");
    assert!(run.steps[1].skipped);
}

#[test]
fn executor_output_roundtrips_through_runs_store() {
    // 步骤 1 得 500（期望 200）→ 失败即停：多步 + skipped 落盘往返
    let responder: Responder = Arc::new(|_index, _line, _body| {
        (
            "HTTP/1.1 500 Internal Server Error".to_string(),
            "boom".to_string(),
        )
    });
    let (addr, _rx) = start_serial_server(1, responder, Duration::ZERO);
    let snap = snapshot("run-persist", vec![dy_step("a", "a"), dy_step("b", "b")]);

    let mut progress = Vec::new();
    let run = run_all(
        &snap,
        &[douyin_connection(format!("http://{addr}/hook"))],
        Duration::from_secs(2),
        &mut |p| progress.push(p),
    );

    let dir = std::env::temp_dir()
        .join("mock-pulse-executor-test")
        .join(format!("persist-{}", uuid::Uuid::new_v4()));
    store::save_runs(&dir, &[run.clone()]).unwrap();
    let reloaded = store::load_runs(&dir).unwrap();
    assert_eq!(reloaded, vec![run]);
    assert!(reloaded[0].steps[1].skipped);
    std::fs::remove_dir_all(&dir).unwrap();
}
