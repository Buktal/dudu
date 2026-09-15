//! 探针握手与直发全链路（本地 TcpListener）：推送探针握手（PMC 签名可由原始
//! body 顶层 kv + query 公共参数复算 + 200/非 2xx）、明文直发（query 公共参数 +
//! body 逐字节透传 + 订单号快照 + timestamp 快照）、超时回执、配置判别。

use std::time::Duration;

use crate::connections::ConnectionConfig;
use crate::test_support::{quick_client, start_single_server};

use super::*;

// ---- 推送探针握手全链路（官方验证握手待核验，探针语义同普通推送） ----

#[test]
fn handshake_posts_probe_sample_and_accepts_200() {
    let (addr, rx) = start_single_server(
        |request| {
            // 接收侧按官方签名规则复算（§4.1）：body 顶层 kv + query 公共参数
            // client_id/timestamp 一起 ASCII 排序 k+v 拼接、secret 夹两端
            let query = request_line_query(&request.request_line);
            let timestamp = query_param(&query, "timestamp").expect("应带 timestamp 参数");
            let client_id = query_param(&query, "client_id").expect("应带 client_id 参数");
            let sign = query_param(&query, "sign").expect("应带 sign 参数");
            assert_eq!(client_id, GOLDEN_CLIENT_ID);
            let mut params = payload_params(&request.body);
            params.push(("client_id".into(), client_id));
            params.push(("timestamp".into(), timestamp));
            let borrowed: Vec<(&str, &str)> =
                params.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
            assert_eq!(sign, pdd_sign(&borrowed, GOLDEN_CLIENT_SECRET));
            // 探针即官方订单状态样本明文（§2.1/§5.1 锚定，逐字）
            assert_eq!(request.body, GOLDEN_PROBE_PLAINTEXT);
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let config = pinduoduo_config(format!("http://{addr}/webhooks/pinduoduo"));
    let outcome = verify_handshake(&client(), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("推送探针"), "{outcome:?}");
    assert!(outcome.message.contains("200"), "{outcome:?}");
    assert!(outcome.message.contains("UPPER(MD5"), "{outcome:?}");

    // 请求侧逐项核对官方协议要素（§4.1 公共参数走 query + Content-Type: application/json）
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(
        request.header("content-type").as_deref(),
        Some("application/json")
    );
    assert_eq!(request.body, GOLDEN_PROBE_PLAINTEXT);
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
    let config = pinduoduo_config(format!("http://{addr}/webhooks/pinduoduo"));
    let outcome = verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("500"), "{outcome:?}");
    assert!(outcome.message.contains("推送探针"), "{outcome:?}");
}

// ---- 明文 JSON 直发全链路 ----

#[test]
fn dispatch_posts_plaintext_with_query_and_snapshots_elements() {
    let (addr, rx) = start_single_server(
        |request| {
            let query = request_line_query(&request.request_line);
            let timestamp = query_param(&query, "timestamp").expect("应带 timestamp 参数");
            let sign = query_param(&query, "sign").expect("应带 sign 参数");
            let mut params = payload_params(&request.body);
            params.push(("client_id".into(), GOLDEN_CLIENT_ID.to_string()));
            params.push(("timestamp".into(), timestamp));
            let borrowed: Vec<(&str, &str)> =
                params.iter().map(|(k, v)| (k.as_str(), v.as_str())).collect();
            assert_eq!(sign, pdd_sign(&borrowed, GOLDEN_CLIENT_SECRET));
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let config = pinduoduo_config(format!("http://{addr}/webhooks/pinduoduo"));

    let outcome = dispatch_event(&client(), &config, GOLDEN_ORDER_PLAINTEXT);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.error, None);
    assert_eq!(outcome.reply, None);
    // 明文逐字节透传（ADR-0001）
    assert_eq!(
        outcome.request_body.as_deref(),
        Some(GOLDEN_ORDER_PLAINTEXT)
    );
    // 订单号快照：order_id 取自明文载荷；签名快照即 sign 参数（32 位大写 hex）
    assert_eq!(outcome.msg_id, "110770592823138");
    assert_eq!(outcome.signature.len(), 32);
    assert!(outcome
        .signature
        .chars()
        .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_lowercase()));
    // timestamp 快照落官方形态（§4.1 UNIX 秒），十进制数字串
    let timestamp = outcome.timestamp.clone().expect("应带 timestamp 快照");
    assert!(
        !timestamp.is_empty() && timestamp.chars().all(|c| c.is_ascii_digit()),
        "UNIX 秒形态：{timestamp}"
    );

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(request.body, GOLDEN_ORDER_PLAINTEXT);
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
    let config = pinduoduo_config(format!("http://{addr}/webhooks/pinduoduo"));

    let outcome = dispatch_event(&client(), &config, GOLDEN_ORDER_PLAINTEXT);

    assert_eq!(outcome.status, 500);
    assert_eq!(outcome.body, "boom");
    assert_eq!(outcome.error, None, "非 200 是回执事实，不是发送错误");
}

#[test]
fn dispatch_reports_timeout_with_pending_retry_note() {
    // 官方重试口径待核验(09-27)：超时文案附待核验提示；客户端 200ms 超时 vs
    // 服务器 1s 延迟
    let slow =
        |_request: &crate::test_support::RecordedPost| ("HTTP/1.1 200 OK".to_string(), String::new());
    let (addr, _rx) = start_single_server(slow, Duration::from_secs(1));
    let config = pinduoduo_config(format!("http://{addr}/webhooks/pinduoduo"));

    let outcome = dispatch_event(&quick_client(Duration::from_millis(200)), &config, "{}");

    assert_eq!(outcome.status, 0, "未收到响应时 status 为 0");
    let error = outcome.error.clone().expect("应有错误原因");
    assert!(error.contains("超时"), "{outcome:?}");
    assert!(error.contains("待核验"), "{outcome:?}");
    assert_eq!(outcome.body, "");
}

// ---- 配置判别 ----

#[test]
fn dispatch_and_handshake_reject_non_pinduoduo_config() {
    let config = ConnectionConfig::Jingdong {
        url: "http://127.0.0.1:1/hook".into(),
        app_key: "yourappkey".into(),
        app_secret: "yourappSecret".into(),
    };

    let outcome = dispatch_event(&client(), &config, "{}");
    assert_eq!(outcome.status, 0);
    assert!(outcome.error.unwrap().contains("不是拼多多渠道"));

    let handshake = verify_handshake(&client(), &config);
    assert!(!handshake.ok);
    assert!(handshake.message.contains("不是拼多多渠道"));
}

// ---- 请求行/query 解析（本文件断言专用，不进协议原语） ----

fn request_line_query(request_line: &str) -> String {
    // 请求行形如 `POST /webhooks/pinduoduo?client_id=…&… HTTP/1.1`
    let raw = request_line.split(' ').nth(1).unwrap_or_default();
    raw.split_once('?').map(|(_, query)| query).unwrap_or("").to_string()
}

fn query_param(query: &str, name: &str) -> Option<String> {
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        if key == name {
            return Some(value.to_string());
        }
    }
    None
}
