//! verify_webhooks 握手与直发全链路（本地 TcpListener）：签名头表可由原始
//! 请求复算（接收侧「签名→验签」自反）+ data 原样回显成功/不一致/缺字段/
//! 非 JSON/非 200 + 明文直发透传与快照 + 凭据缺失直发前拒绝 + 超时回执。
//! 协议原语经本渠道 Adapter 直调（收窄签名，配置判别由注册表路由保证）。

use std::time::Duration;

use crate::connections::{ChannelAdapter, ConnectionConfig};
use crate::test_support::{quick_client, start_single_server, RecordedPost};

use super::*;

/// 签名头表字段（按头名字典序，接收侧复算拼接序；字段序由 golden 锚定）。
const CANONICAL_NAMES: [&str; 6] = [
    "x-bili-accesskeyid",
    "x-bili-content-md5",
    "x-bili-signature-method",
    "x-bili-signature-nonce",
    "x-bili-signature-version",
    "x-bili-timestamp",
];

/// 接收侧验签（「签名→验签」自反）：取收到的六个 x-bili-* 头值按头名字典序
/// \n 连接，HMAC-SHA256(secret) 复算，与 Authorization 头一致即合法。
fn signature_verifies(request: &RecordedPost, app_secret: &str) -> bool {
    let mut values = Vec::with_capacity(CANONICAL_NAMES.len());
    for name in CANONICAL_NAMES {
        match request.header(name) {
            Some(value) => values.push(value),
            None => return false,
        }
    }
    let recomputed = crate::connections::util::hmac_sha256_hex(app_secret, &values.join("\n"));
    request.header("Authorization").as_deref() == Some(recomputed.as_str())
}

/// verify_webhooks 成功应答（§3.2 镜像口径「解析出 data 值并原样返回」）。
fn data_reply(request_body: &str) -> (String, String) {
    let data = serde_json::from_str::<serde_json::Value>(request_body)
        .ok()
        .map(|parsed| parsed["content"]["data"].clone())
        .unwrap_or(serde_json::Value::Null);
    ("HTTP/1.1 200 OK".into(), format!(r#"{{"data":{data}}}"#))
}

// ---- verify_webhooks 握手全链路（§3.2 配地址失焦校验，镜像口径） ----

#[test]
fn handshake_posts_verify_webhooks_and_accepts_data_echo() {
    let (addr, rx) = start_single_server(
        |request| {
            // 接收侧按官方头表验签：Authorization 可由收到的头值复算
            assert!(
                signature_verifies(request, GOLDEN_APP_SECRET),
                "Authorization 应可由 x-bili-* 头值 + secret 复算"
            );
            // content-md5 与原始 body 一致（官方「请求体当字符串做 MD5」）
            assert_eq!(
                request.header("x-bili-content-md5").as_deref(),
                Some(content_md5(&request.body).as_str())
            );
            // x-bili-accesskeyid 即连接配置的 client_id；官方必填头 Accept
            assert_eq!(
                request.header("x-bili-accesskeyid").as_deref(),
                Some(GOLDEN_CLIENT_ID)
            );
            assert_eq!(
                request.header("Accept").as_deref(),
                Some("application/json")
            );
            data_reply(&request.body)
        },
        Duration::ZERO,
    );
    let config = bilibili_config(format!("http://{addr}/webhooks/bilibili"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("verify_webhooks"), "{outcome:?}");
    assert!(outcome.message.contains("data"), "{outcome:?}");

    // 请求侧逐项核对官方协议要素（信封键序 event → content → timestamp）
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert!(
        request.request_line.starts_with("POST "),
        "握手为 POST：{}",
        request.request_line
    );
    assert!(
        !request.request_line.contains('?'),
        "官方 POST 不带 query：{}",
        request.request_line
    );
    let parsed: serde_json::Value = serde_json::from_str(&request.body).unwrap();
    let keys: Vec<&str> = parsed
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    assert_eq!(keys, ["event", "content", "timestamp"]);
    assert_eq!(parsed["event"], "verify_webhooks");
    // timestamp 为 UTC+8 字符串（yyyy-MM-dd HH:mm:ss），非 unix 秒
    let timestamp = parsed["timestamp"].as_str().unwrap();
    assert_eq!(timestamp.len(), 19);
    assert_eq!(&timestamp[10..11], " ", "日期与时刻以空格分隔");
    assert_eq!(&timestamp[4..5], "-");
}

#[test]
fn handshake_fails_when_data_not_echoed() {
    // 官方要求解析出 data 原样返回（回显别的值即校验失败）
    let wrong_echo =
        |_request: &RecordedPost| ("HTTP/1.1 200 OK".into(), r#"{"data":42}"#.to_string());
    let (addr, _rx) = start_single_server(wrong_echo, Duration::ZERO);
    let config = bilibili_config(format!("http://{addr}/webhooks/bilibili"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("data"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_json_without_data_field() {
    // 回 JSON 信封但缺 data（官方要求解析出 data 原样返回）
    let no_data = |_request: &RecordedPost| ("HTTP/1.1 200 OK".into(), r#"{"code":0}"#.to_string());
    let (addr, _rx) = start_single_server(no_data, Duration::ZERO);
    let config = bilibili_config(format!("http://{addr}/webhooks/bilibili"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("data"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_non_json_body() {
    let plain = |_request: &RecordedPost| ("HTTP/1.1 200 OK".into(), "pong".to_string());
    let (addr, _rx) = start_single_server(plain, Duration::ZERO);
    let config = bilibili_config(format!("http://{addr}/webhooks/bilibili"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("合法 JSON"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_non_200() {
    let boom = |_request: &RecordedPost| {
        (
            "HTTP/1.1 500 Internal Server Error".into(),
            "boom".to_string(),
        )
    };
    let (addr, _rx) = start_single_server(boom, Duration::ZERO);
    let config = bilibili_config(format!("http://{addr}/webhooks/bilibili"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("500"), "{outcome:?}");
    assert!(outcome.message.contains("data"), "{outcome:?}");
}

// ---- 事件明文直发全链路 ----

#[test]
fn dispatch_posts_plaintext_with_signature_headers_and_snapshots() {
    let (addr, rx) = start_single_server(
        |request| {
            assert!(signature_verifies(request, GOLDEN_APP_SECRET));
            data_reply(&request.body)
        },
        Duration::ZERO,
    );
    let config = bilibili_config(format!("http://{addr}/webhooks/bilibili"));

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_EVENT_PLAINTEXT);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.error, None);
    assert_eq!(outcome.reply, None);
    // 明文逐字节透传（ADR-0001）
    assert_eq!(
        outcome.request_body.as_deref(),
        Some(GOLDEN_EVENT_PLAINTEXT)
    );
    // 快照：nonce 落 msg_id（官方无幂等键，每请求唯一要素）、timestamp 落
    // x-bili-timestamp（unix 秒）、signature 即 Authorization 头值
    assert_eq!(outcome.msg_id.len(), 36, "nonce 为 UUID 形态");
    let timestamp = outcome.timestamp.as_deref().expect("应有时间戳快照");
    assert!(
        timestamp.parse::<u64>().is_ok(),
        "x-bili-timestamp 为 unix 秒"
    );

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(request.body, GOLDEN_EVENT_PLAINTEXT);
    assert_eq!(
        request.header("Authorization").as_deref(),
        Some(outcome.signature.as_str())
    );
    assert_eq!(
        request.header("x-bili-timestamp").as_deref(),
        Some(timestamp)
    );
    assert_eq!(
        request.header("x-bili-signature-nonce").as_deref(),
        Some(outcome.msg_id.as_str())
    );
    assert_eq!(
        request.header("x-bili-content-md5").as_deref(),
        Some(content_md5(GOLDEN_EVENT_PLAINTEXT).as_str())
    );
}

#[test]
fn dispatch_reports_non_200_status_and_body() {
    let boom = |_request: &RecordedPost| {
        (
            "HTTP/1.1 500 Internal Server Error".into(),
            "boom".to_string(),
        )
    };
    let (addr, _rx) = start_single_server(boom, Duration::ZERO);
    let config = bilibili_config(format!("http://{addr}/webhooks/bilibili"));

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_EVENT_PLAINTEXT);

    assert_eq!(outcome.status, 500);
    assert_eq!(outcome.body, "boom");
    assert_eq!(outcome.error, None, "非 200 是回执事实，不是发送错误");
}

#[test]
fn dispatch_reports_timeout_with_retry_note() {
    // 官方 5s 建连超时即断、失败最多共推 3 次（§3.3 镜像口径）；
    // 客户端 200ms 超时 vs 服务器 1s 延迟
    let slow = |_request: &RecordedPost| ("HTTP/1.1 200 OK".to_string(), "{}".to_string());
    let (addr, _rx) = start_single_server(slow, Duration::from_secs(1));
    let config = bilibili_config(format!("http://{addr}/webhooks/bilibili"));

    let outcome = Adapter.dispatch_event(&quick_client(Duration::from_millis(200)), &config, "{}");

    assert_eq!(outcome.status, 0, "未收到响应时 status 为 0");
    let error = outcome.error.clone().expect("应有错误原因");
    assert!(error.contains("超时"), "{outcome:?}");
    assert!(error.contains("共推 3 次"), "{outcome:?}");
    assert_eq!(outcome.body, "");
}

// ---- 凭据缺失直发前拒绝（缺失凭据构造不出真实 B站 不会发的请求） ----

#[test]
fn dispatch_rejects_missing_client_id_before_sending() {
    let (addr, _rx) = start_single_server(
        |_request| ("HTTP/1.1 200 OK".to_string(), "{}".to_string()),
        Duration::ZERO,
    );
    let config = ConnectionConfig::Bilibili {
        url: format!("http://{addr}/webhooks/bilibili"),
        client_id: String::new(),
        app_secret: GOLDEN_APP_SECRET.into(),
    };

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_EVENT_PLAINTEXT);

    assert_eq!(outcome.status, 0, "未发出请求");
    assert_eq!(outcome.request_body, None);
    let error = outcome.error.expect("应有拒绝原因");
    assert!(error.contains("x-bili-accesskeyid"), "{error:?}");
}

#[test]
fn dispatch_rejects_missing_app_secret_before_sending() {
    let (addr, _rx) = start_single_server(
        |_request| ("HTTP/1.1 200 OK".to_string(), "{}".to_string()),
        Duration::ZERO,
    );
    let config = ConnectionConfig::Bilibili {
        url: format!("http://{addr}/webhooks/bilibili"),
        client_id: GOLDEN_CLIENT_ID.into(),
        app_secret: String::new(),
    };

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_EVENT_PLAINTEXT);

    assert_eq!(outcome.status, 0, "未发出请求");
    assert_eq!(outcome.signature, "", "未发出请求即无签名快照");
    let error = outcome.error.expect("应有拒绝原因");
    assert!(error.contains("HMAC-SHA256"), "{error:?}");
}
