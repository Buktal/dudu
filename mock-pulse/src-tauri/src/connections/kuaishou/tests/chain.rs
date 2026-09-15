//! 握手与直发全链路（本地 TcpListener）：TEST 事件握手（kwaisign 可由原始
//! body 复算 + result=1 回显成功/result≠1/message_id 不回传/非 2xx）、明文直发
//! （header kwaisign + body 逐字节透传 + 快照）、超时回执、配置判别。

use std::time::Duration;

use crate::connections::ConnectionConfig;
use crate::test_support::{quick_client, start_single_server};

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
    let (addr, rx) = start_single_server(
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
    );
    let config = kuaishou_config(format!("http://{addr}/webhooks/kuaishou"));
    let outcome = verify_handshake(&client(), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("TEST"), "{outcome:?}");
    assert!(outcome.message.contains("result=1"), "{outcome:?}");

    // 请求侧逐项核对官方协议要素（§2.1 信封五字段键序）
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
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
    let zero_result = |request: &crate::test_support::RecordedPost| {
        let echoed = message_id_of(&request.body);
        (
            "HTTP/1.1 200 OK".into(),
            format!(r#"{{"result":0,"message_id":"{echoed}"}}"#),
        )
    };
    let (addr, _rx) = start_single_server(zero_result, Duration::ZERO);
    let config = kuaishou_config(format!("http://{addr}/webhooks/kuaishou"));
    let outcome = verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("result"), "{outcome:?}");
}

#[test]
fn handshake_fails_when_message_id_not_echoed() {
    // 官方要求回传收到的 message_id（回传别的值即验证失败）
    let wrong_echo = |_request: &crate::test_support::RecordedPost| {
        (
            "HTTP/1.1 200 OK".into(),
            r#"{"result":1,"message_id":"other"}"#.to_string(),
        )
    };
    let (addr, _rx) = start_single_server(wrong_echo, Duration::ZERO);
    let config = kuaishou_config(format!("http://{addr}/webhooks/kuaishou"));
    let outcome = verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("message_id"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_non_200() {
    let boom = |_request: &crate::test_support::RecordedPost| {
        (
            "HTTP/1.1 500 Internal Server Error".into(),
            "boom".to_string(),
        )
    };
    let (addr, _rx) = start_single_server(boom, Duration::ZERO);
    let config = kuaishou_config(format!("http://{addr}/webhooks/kuaishou"));
    let outcome = verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("500"), "{outcome:?}");
}

// ---- 明文 JSON 直发全链路（两域共用同一传输） ----

#[test]
fn dispatch_posts_plaintext_with_kwaisign_header_and_snapshots_elements() {
    let (addr, rx) = start_single_server(
        |request| {
            assert_eq!(
                request.header("kwaisign").as_deref(),
                Some(kwaisign(&request.body, GOLDEN_APP_SECRET).as_str())
            );
            result_reply(&request.body)
        },
        Duration::ZERO,
    );
    let config = kuaishou_config(format!("http://{addr}/webhooks/kuaishou"));

    let outcome = dispatch_event(&client(), &config, GOLDEN_EVENT_PLAINTEXT);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.error, None);
    assert_eq!(outcome.reply, None);
    // 明文逐字节透传（ADR-0001）
    assert_eq!(
        outcome.request_body.as_deref(),
        Some(GOLDEN_EVENT_PLAINTEXT)
    );
    // 幂等键快照：message_id 取自明文载荷；签名快照即 kwaisign
    assert_eq!(outcome.msg_id, GOLDEN_MESSAGE_ID);
    assert_eq!(
        outcome.signature,
        kwaisign(GOLDEN_EVENT_PLAINTEXT, GOLDEN_APP_SECRET)
    );
    // 官方请求无独立时间戳要素（timestamp 在载荷信封内），快照不落值
    assert_eq!(outcome.timestamp, None);

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(request.body, GOLDEN_EVENT_PLAINTEXT);
}

#[test]
fn dispatch_reports_non_200_status_and_body() {
    let boom = |_request: &crate::test_support::RecordedPost| {
        (
            "HTTP/1.1 500 Internal Server Error".into(),
            "boom".to_string(),
        )
    };
    let (addr, _rx) = start_single_server(boom, Duration::ZERO);
    let config = kuaishou_config(format!("http://{addr}/webhooks/kuaishou"));

    let outcome = dispatch_event(&client(), &config, GOLDEN_EVENT_PLAINTEXT);

    assert_eq!(outcome.status, 500);
    assert_eq!(outcome.body, "boom");
    assert_eq!(outcome.error, None, "非 200 是回执事实，不是发送错误");
}

#[test]
fn dispatch_reports_timeout_without_response() {
    // 官方失败即按重试表重推（最长 16 次）；客户端 200ms 超时 vs 服务器 1s 延迟
    let slow = |_request: &crate::test_support::RecordedPost| {
        ("HTTP/1.1 200 OK".to_string(), result_reply("{}").1)
    };
    let (addr, _rx) = start_single_server(slow, Duration::from_secs(1));
    let config = kuaishou_config(format!("http://{addr}/webhooks/kuaishou"));

    let outcome = dispatch_event(&quick_client(Duration::from_millis(200)), &config, "{}");

    assert_eq!(outcome.status, 0, "未收到响应时 status 为 0");
    let error = outcome.error.clone().expect("应有错误原因");
    assert!(error.contains("超时"), "{outcome:?}");
    assert!(error.contains("重试"), "{outcome:?}");
    assert_eq!(outcome.body, "");
}

// ---- 配置判别 ----

#[test]
fn dispatch_and_handshake_reject_non_kuaishou_config() {
    let config = ConnectionConfig::Qq {
        url: "http://127.0.0.1:1/hook".into(),
        app_id: "11111111".into(),
        app_secret: "DG5g3B4j9X2KOErG".into(),
    };

    let outcome = dispatch_event(&client(), &config, "{}");
    assert_eq!(outcome.status, 0);
    assert!(outcome.error.unwrap().contains("不是快手渠道"));

    let handshake = verify_handshake(&client(), &config);
    assert!(!handshake.ok);
    assert!(handshake.message.contains("不是快手渠道"));
}
