//! 握手与直发全链路（本地 TcpListener）：Verify 验证握手（Authorization 可由
//! 原始 body 复算 + 200 签收/非 2xx）、明文直发（Authorization 头 + body 逐字节
//! 透传 + 幂等键快照）、超时回执。
//! 协议原语经本渠道 Adapter 直调（收窄签名，配置判别由注册表路由保证）。

use std::time::Duration;

use crate::connections::ChannelAdapter;
use crate::test_support::{quick_client, start_single_server};

use super::*;

// ---- Verify 验证握手全链路（§3.2 配置页：返回 HTTP 200 即验证成功） ----

#[test]
fn handshake_posts_forward_sample_and_accepts_200() {
    let (addr, rx) = start_single_server(
        |request| {
            // 接收侧按官方协议验签（§4.2）：Authorization = HEX(HMAC-SHA256(AppKey+body, AppSecret))
            assert_eq!(
                request.header("Authorization").as_deref(),
                Some(authorization(&request.body, GOLDEN_APP_KEY, GOLDEN_APP_SECRET).as_str()),
                "Authorization 头应可由原始 body + AppKey 前缀复算"
            );
            // 探针即官方正向样本明文（§5.6 逐字）
            assert_eq!(request.body, GOLDEN_FORWARD_PLAINTEXT);
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let config = taobao_config(format!("http://{addr}/webhooks/taobao"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("Verify"), "{outcome:?}");
    assert!(outcome.message.contains("200"), "{outcome:?}");

    // 请求侧逐项核对官方协议要素（§3.2：https 回调 + Content-Type: application/json）
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(
        request.header("content-type").as_deref(),
        Some("application/json")
    );
    assert_eq!(request.body, GOLDEN_FORWARD_PLAINTEXT);
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
    let config = taobao_config(format!("http://{addr}/webhooks/taobao"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("500"), "{outcome:?}");
    assert!(outcome.message.contains("Verify"), "{outcome:?}");
}

// ---- 明文 JSON 直发全链路 ----

#[test]
fn dispatch_posts_plaintext_with_authorization_and_snapshots_elements() {
    let (addr, rx) = start_single_server(
        |request| {
            assert_eq!(
                request.header("Authorization").as_deref(),
                Some(authorization(&request.body, GOLDEN_APP_KEY, GOLDEN_APP_SECRET).as_str())
            );
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let config = taobao_config(format!("http://{addr}/webhooks/taobao"));

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_TRADE_PLAINTEXT);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.error, None);
    assert_eq!(outcome.reply, None);
    // 明文逐字节透传（ADR-0001）
    assert_eq!(
        outcome.request_body.as_deref(),
        Some(GOLDEN_TRADE_PLAINTEXT)
    );
    // 幂等键快照：tid 取自明文载荷；签名快照即 Authorization 头
    assert_eq!(outcome.msg_id, GOLDEN_TRADE_TID);
    assert_eq!(
        outcome.signature,
        authorization(GOLDEN_TRADE_PLAINTEXT, GOLDEN_APP_KEY, GOLDEN_APP_SECRET)
    );
    // 官方请求无独立时间戳要素（timestamp 在载荷信封内），快照不落值
    assert_eq!(outcome.timestamp, None);

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(request.body, GOLDEN_TRADE_PLAINTEXT);
}

#[test]
fn dispatch_snapshots_official_idempotency_key_per_template() {
    // 四类模板的 msg_id 快照各取官方幂等键（事实库 §3.3）
    let cases: [(&str, &str); 3] = [
        (GOLDEN_REFUND_PLAINTEXT, GOLDEN_REFUND_ID),
        (GOLDEN_OFFMSG_PLAINTEXT, GOLDEN_OFFMSG_MSG_ID),
        (GOLDEN_FORWARD_PLAINTEXT, GOLDEN_FORWARD_TRADE_ORDER_ID),
    ];
    for (plaintext, expected) in cases {
        let (addr, _rx) = start_single_server(
            |_request| ("HTTP/1.1 200 OK".into(), String::new()),
            Duration::ZERO,
        );
        let config = taobao_config(format!("http://{addr}/webhooks/taobao"));
        let outcome = Adapter.dispatch_event(&client(), &config, plaintext);
        assert_eq!(outcome.status, 200);
        assert_eq!(outcome.msg_id, expected, "{plaintext}");
    }
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
    let config = taobao_config(format!("http://{addr}/webhooks/taobao"));

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_TRADE_PLAINTEXT);

    assert_eq!(outcome.status, 500);
    assert_eq!(outcome.body, "boom");
    assert_eq!(outcome.error, None, "非 200 是回执事实，不是发送错误");
}

#[test]
fn dispatch_reports_timeout_with_official_retry_semantics() {
    // 官方 500ms 签收语义：超时未收到 200 即推送失败（半小时后重试，最多 12 次）；
    // 客户端 200ms 超时 vs 服务器 1s 延迟
    let slow = |_request: &crate::test_support::RecordedPost| {
        ("HTTP/1.1 200 OK".to_string(), String::new())
    };
    let (addr, _rx) = start_single_server(slow, Duration::from_secs(1));
    let config = taobao_config(format!("http://{addr}/webhooks/taobao"));

    let outcome = Adapter.dispatch_event(&quick_client(Duration::from_millis(200)), &config, "{}");

    assert_eq!(outcome.status, 0, "未收到响应时 status 为 0");
    let error = outcome.error.clone().expect("应有错误原因");
    assert!(error.contains("超时"), "{outcome:?}");
    assert!(error.contains("500ms"), "{outcome:?}");
    assert!(error.contains("12 次"), "{outcome:?}");
    assert_eq!(outcome.body, "");
}
