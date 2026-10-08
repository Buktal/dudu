//! 探针与直发全链路（本地 TcpListener）：恒等头原样携带可核（原样比对
//! 验证链路）+ 官方 §5.2 探针样本逐字节透传 + secret_token 缺失/不合法
//! 直发前拒绝（缺失/超 256 字符/非法字符边界）+ 2XY 应答语义 + 非 200/
//! 超时回执。
//! 协议原语经本渠道 Adapter 直调（收窄签名，配置判别由注册表路由保证）。

use std::time::Duration;

use crate::connections::{ChannelAdapter, ConnectionConfig};
use crate::test_support::{
    ExpectedSnapshots, assert_dispatch_error, assert_dispatch_receipt, assert_snapshots,
    run_dispatch_case, run_handshake_case, status_responder,
};

use super::*;

// ---- 推送探针（§3.2 无 challenge，探针语义同普通推送） ----

#[test]
fn probe_posts_official_update_with_identity_header() {
    let (_outcome, request) = run_handshake_case(
        |request| {
            // 接收侧原样比对（§4.1）：头值与配置 secret_token 字符串相等
            assert_eq!(
                request
                    .header("x-telegram-bot-api-secret-token")
                    .as_deref(),
                Some(GOLDEN_SECRET_TOKEN),
                "恒等头应与连接配置的 Secret Token 原样一致"
            );
            // 官方自测样本（§5.2）逐字节透传
            assert_eq!(request.body, GOLDEN_PROBE_PLAINTEXT);
            // 成功判 2XY（应答正文无口径）
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| telegram_config(format!("http://{addr}/webhooks/telegram")),
        |client, config| Adapter.verify_handshake(client, config),
        true,
        &["2XY", "无 HMAC"],
    );

    // 请求侧逐项核对官方协议要素
    assert!(
        request.request_line.starts_with("POST "),
        "探针为 POST：{}",
        request.request_line
    );
    assert!(
        !request.request_line.contains('?'),
        "官方 Webhook POST 不带 query：{}",
        request.request_line
    );
    assert!(
        request
            .head
            .to_ascii_lowercase()
            .contains("content-type: application/json"),
        "POST 应带 JSON Content-Type：{}",
        request.head
    );
    assert_eq!(request.body, GOLDEN_PROBE_PLAINTEXT);
}

#[test]
fn probe_fails_on_non_2xy() {
    // 官方成功判 2XY；404 等非 2XY 即探针未通过
    run_handshake_case(
        status_responder("HTTP/1.1 404 Not Found", ""),
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| telegram_config(format!("http://{addr}/webhooks/telegram")),
        |client, config| Adapter.verify_handshake(client, config),
        false,
        &["404", "探针"],
    );
}

#[test]
fn probe_reports_timeout_with_retry_note() {
    // 官方非 2XY 才重推且时刻表未公开；客户端 200ms 超时 vs 服务器 1s 延迟
    run_handshake_case(
        status_responder("HTTP/1.1 200 OK", ""),
        Duration::from_secs(1),
        Duration::from_millis(200),
        |addr| telegram_config(format!("http://{addr}/webhooks/telegram")),
        |client, config| Adapter.verify_handshake(client, config),
        false,
        &["超时", "合理次数"],
    );
}

// ---- JSON Update 直发（恒等头 + update_id 幂等键） ----

#[test]
fn dispatch_posts_update_verbatim_and_snapshots_update_id() {
    let (outcome, _request) = run_dispatch_case(
        |request| {
            // 接收侧原样比对验证链路：头值与配置逐字符一致
            assert_eq!(
                request
                    .header("x-telegram-bot-api-secret-token")
                    .as_deref(),
                Some(GOLDEN_SECRET_TOKEN)
            );
            ("HTTP/1.1 204 No Content".into(), String::new())
        },
        GOLDEN_PROBE_PLAINTEXT,
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| telegram_config(format!("http://{addr}/webhooks/telegram")),
        |client, config, body| Adapter.dispatch_event(client, config, body),
    );

    assert_eq!(outcome.status, 204, "2XY 语义：204 亦属成功");
    assert_eq!(outcome.error, None);
    assert_eq!(outcome.reply, None);
    // 明文逐字节透传（ADR-0001）
    assert_eq!(
        outcome.request_body.as_deref(),
        Some(GOLDEN_PROBE_PLAINTEXT)
    );
    // 幂等键快照：update_id（§2.1 去重/恢复顺序）；签名快照即恒等头值；
    // 无 query/时间戳要素（官方 Webhook POST 仅头 + body）
    assert_snapshots(
        &outcome,
        ExpectedSnapshots {
            msg_id: "10000",
            signature: GOLDEN_SECRET_TOKEN,
            timestamp: None,
        },
    );
}

#[test]
fn dispatch_snapshots_update_id_across_update_types() {
    let (outcome, _request) = run_dispatch_case(
        status_responder("HTTP/1.1 200 OK", ""),
        GOLDEN_CALLBACK_PLAINTEXT,
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| telegram_config(format!("http://{addr}/webhooks/telegram")),
        |client, config, body| Adapter.dispatch_event(client, config, body),
    );

    // callback_query 代表（§5.2 样本压单行）：update_id 快照同语义
    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.msg_id, "10000");
    assert_eq!(
        outcome.request_body.as_deref(),
        Some(GOLDEN_CALLBACK_PLAINTEXT)
    );
}

#[test]
fn dispatch_reports_non_2xy_status_and_body() {
    let (outcome, _request) = run_dispatch_case(
        status_responder("HTTP/1.1 500 Internal Server Error", "boom"),
        GOLDEN_PROBE_PLAINTEXT,
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| telegram_config(format!("http://{addr}/webhooks/telegram")),
        |client, config, body| Adapter.dispatch_event(client, config, body),
    );

    assert_dispatch_receipt(&outcome, 500, "boom");
}

// ---- secret_token 边界（缺失 / 不匹配形态 / 1–256 字符边界） ----

#[test]
fn dispatch_rejects_missing_secret_token_before_sending() {
    // 越限前拒绝：未发出请求，无需录制服务
    let config = ConnectionConfig::Telegram {
        url: "http://127.0.0.1:1/webhooks/telegram".into(),
        secret_token: String::new(),
    };

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_PROBE_PLAINTEXT);

    assert_dispatch_error(&outcome, &["未配置"]);
    assert_eq!(outcome.request_body, None);
}

#[test]
fn dispatch_rejects_secret_token_over_256_chars() {
    // 越限前拒绝：未发出请求，无需录制服务
    let config = ConnectionConfig::Telegram {
        url: "http://127.0.0.1:1/webhooks/telegram".into(),
        // 上边界 +1：257 字符越限（真实 setWebhook 拒收 1–256 之外的值）
        secret_token: "a".repeat(257),
    };

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_PROBE_PLAINTEXT);

    assert_dispatch_error(&outcome, &["1–256"]);
    assert_eq!(outcome.signature, "", "未发出请求即无头值快照");
}

#[test]
fn dispatch_carries_256_char_boundary_token_verbatim() {
    // 上边界：恰 256 字符合法，且原样进头（原样比对链路在边界值仍成立）
    let charset = b"Aa0_-";
    let token: String = (0..256)
        .map(|index| charset[index % charset.len()] as char)
        .collect();
    assert_eq!(token.len(), 256);
    let expected = token.clone();
    let (outcome, request) = run_dispatch_case(
        move |request| {
            assert_eq!(
                request
                    .header("x-telegram-bot-api-secret-token")
                    .as_deref(),
                Some(expected.as_str()),
                "边界 token 应原样进头"
            );
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        GOLDEN_PROBE_PLAINTEXT,
        Duration::ZERO,
        Duration::from_secs(2),
        {
            let token = token.clone();
            move |addr| ConnectionConfig::Telegram {
                url: format!("http://{addr}/webhooks/telegram"),
                secret_token: token.clone(),
            }
        },
        |client, config, body| Adapter.dispatch_event(client, config, body),
    );

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.signature, token);
    assert_eq!(
        request
            .header("x-telegram-bot-api-secret-token")
            .as_deref(),
        Some(token.as_str())
    );
}

#[test]
fn dispatch_rejects_secret_token_with_foreign_characters() {
    // 越限前拒绝：未发出请求，无需录制服务
    let config = ConnectionConfig::Telegram {
        url: "http://127.0.0.1:1/webhooks/telegram".into(),
        // 官方字符集仅 A-Za-z0-9_-：空格/加号/等号均越限
        secret_token: "bad token+value=".into(),
    };

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_PROBE_PLAINTEXT);

    assert_dispatch_error(&outcome, &["A-Z"]);
}
