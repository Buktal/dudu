//! 握手与直发全链路（本地 TcpListener）：TEST 事件握手（kwaisign 可由原始
//! body 复算 + result=1 回显成功/result≠1/message_id 不回传/非 2xx）、明文直发
//! （header kwaisign + body 逐字节透传 + 快照）、超时回执。
//! 协议原语经本渠道 Adapter 直调（收窄签名，配置判别由注册表路由保证）。

use std::time::Duration;

use crate::connections::ChannelAdapter;
use crate::test_support::{
    ExpectedSnapshots, assert_dispatch_error, assert_dispatch_receipt, assert_snapshots,
    run_dispatch_case, run_handshake_case, status_responder,
};

use super::*;

/// 官方成功应答（§3.2 七页逐字一致）：result=1 + 回传收到的 message_id。
fn result_reply(request_body: &str) -> (String, String) {
    let echoed = message_id_of(request_body);
    (
        "HTTP/1.1 200 OK".into(),
        format!(r#"{{"result":1,"message_id":"{echoed}"}}"#),
    )
}

// ---- TEST 事件握手全链路（§3.1 配地址验证） ----

#[test]
fn handshake_posts_test_event_and_accepts_official_result_reply() {
    let (_outcome, request) = run_handshake_case(
        |request| {
            // 接收侧按官方协议验签（§4.1）：header kwaisign = MD5(原始 body + secret)
            assert_eq!(
                request.header("kwaisign").as_deref(),
                Some(kwaisign(&request.body, GOLDEN_APP_SECRET).as_str()),
                "kwaisign 头应可由原始 body 复算"
            );
            // TEST 事件判型（§2.1）：event=TEST，data 只含与信封同值的测试时间戳
            let parsed: serde_json::Value = serde_json::from_str(&request.body).unwrap();
            assert_eq!(parsed["event"], "TEST");
            assert_eq!(
                parsed["data"]["timestamp"], parsed["timestamp"],
                "测试时间戳应与信封 timestamp 同值"
            );
            result_reply(&request.body)
        },
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| kuaishou_config(format!("http://{addr}/webhooks/kuaishou")),
        |client, config| Adapter.verify_handshake(client, config),
        true,
        &["TEST", "result=1"],
    );

    // 请求侧逐项核对官方协议要素（§2.1 信封五字段键序）
    assert_eq!(
        request.header("content-type").as_deref(),
        Some("application/json")
    );
    let parsed: serde_json::Value = serde_json::from_str(&request.body).unwrap();
    let keys: Vec<&str> = parsed
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    assert_eq!(keys, ["app_id", "event", "timestamp", "message_id", "data"]);
    assert_eq!(parsed["app_id"], GOLDEN_APP_ID);
    // message_id 为「每次随机生成的 ID」：UUID 形态且不与样本重放
    let sent_id = parsed["message_id"].as_str().unwrap();
    assert_eq!(sent_id.len(), 36);
    assert_ne!(sent_id, GOLDEN_MESSAGE_ID);
}

#[test]
fn handshake_fails_when_result_is_not_one() {
    // 官方口径：result=1 之外一律失败（平台重试）
    run_handshake_case(
        |request| {
            let echoed = message_id_of(&request.body);
            (
                "HTTP/1.1 200 OK".into(),
                format!(r#"{{"result":0,"message_id":"{echoed}"}}"#),
            )
        },
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| kuaishou_config(format!("http://{addr}/webhooks/kuaishou")),
        |client, config| Adapter.verify_handshake(client, config),
        false,
        &["result"],
    );
}

#[test]
fn handshake_fails_when_message_id_not_echoed() {
    // 官方要求回传收到的 message_id（回传别的值即验证失败）
    run_handshake_case(
        |_request| {
            (
                "HTTP/1.1 200 OK".into(),
                r#"{"result":1,"message_id":"other"}"#.to_string(),
            )
        },
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| kuaishou_config(format!("http://{addr}/webhooks/kuaishou")),
        |client, config| Adapter.verify_handshake(client, config),
        false,
        &["message_id"],
    );
}

#[test]
fn handshake_fails_on_non_200() {
    run_handshake_case(
        status_responder("HTTP/1.1 500 Internal Server Error", "boom"),
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| kuaishou_config(format!("http://{addr}/webhooks/kuaishou")),
        |client, config| Adapter.verify_handshake(client, config),
        false,
        &["500"],
    );
}

// ---- 明文 JSON 直发全链路（两域共用同一传输） ----

#[test]
fn dispatch_posts_plaintext_with_kwaisign_header_and_snapshots_elements() {
    let (outcome, request) = run_dispatch_case(
        |request| {
            assert_eq!(
                request.header("kwaisign").as_deref(),
                Some(kwaisign(&request.body, GOLDEN_APP_SECRET).as_str())
            );
            result_reply(&request.body)
        },
        GOLDEN_EVENT_PLAINTEXT,
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| kuaishou_config(format!("http://{addr}/webhooks/kuaishou")),
        |client, config, body| Adapter.dispatch_event(client, config, body),
    );

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.error, None);
    assert_eq!(outcome.reply, None);
    // 明文逐字节透传（ADR-0001）
    assert_eq!(
        outcome.request_body.as_deref(),
        Some(GOLDEN_EVENT_PLAINTEXT)
    );
    // 幂等键快照：message_id 取自明文载荷；签名快照即 kwaisign；
    // 官方请求无独立时间戳要素（timestamp 在载荷信封内），快照不落值
    assert_snapshots(
        &outcome,
        ExpectedSnapshots {
            msg_id: GOLDEN_MESSAGE_ID,
            signature: &kwaisign(GOLDEN_EVENT_PLAINTEXT, GOLDEN_APP_SECRET),
            timestamp: None,
        },
    );

    assert_eq!(request.body, GOLDEN_EVENT_PLAINTEXT);
}

#[test]
fn dispatch_reports_non_200_status_and_body() {
    let (outcome, _request) = run_dispatch_case(
        status_responder("HTTP/1.1 500 Internal Server Error", "boom"),
        GOLDEN_EVENT_PLAINTEXT,
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| kuaishou_config(format!("http://{addr}/webhooks/kuaishou")),
        |client, config, body| Adapter.dispatch_event(client, config, body),
    );

    assert_dispatch_receipt(&outcome, 500, "boom");
}

#[test]
fn dispatch_reports_timeout_without_response() {
    // 官方失败即按重试表重推（最长 16 次）；客户端 200ms 超时 vs 服务器 1s 延迟
    let (outcome, _request) = run_dispatch_case(
        |_request| ("HTTP/1.1 200 OK".to_string(), result_reply("{}").1),
        "{}",
        Duration::from_secs(1),
        Duration::from_millis(200),
        |addr| kuaishou_config(format!("http://{addr}/webhooks/kuaishou")),
        |client, config, body| Adapter.dispatch_event(client, config, body),
    );

    assert_dispatch_error(&outcome, &["超时", "重试"]);
}
