//! 探针握手与直发全链路（本地 TcpListener）：推送探针握手（sig 可由 Query
//! 系统参数复算 + 200/非 2xx）、JSON 推送直发（明文逐字节透传 + Query 系统
//! 参数）、H5 表单直发（表单全字段参签 + 旧 sig 剔除 + 订单号快照）、超时
//! 回执。
//! 协议原语经本渠道 Adapter 直调（收窄签名，配置判别由注册表路由保证）。

use std::time::Duration;

use crate::connections::ChannelAdapter;
use crate::test_support::{quick_client, start_single_server};

use super::*;

/// 接收侧按官方签名规则复算（§4.1 五步）：params = 参签 kv（解码值），拼
/// url?…+secret 同一原语，互为对拍。
fn recompute_sig(url: &str, params: &[(String, String)]) -> String {
    let borrowed: Vec<(&str, &str)> =
        params.iter().map(|(key, value)| (key.as_str(), value.as_str())).collect();
    ele_sign(url, &borrowed, GOLDEN_SECRET)
}

/// 从请求行 query 取参数值（百分号解码）。
fn query_param<'a>(request_line: &str, name: &str) -> Option<String> {
    let raw = request_line.split(' ').nth(1).unwrap_or_default();
    let (_, query) = raw.split_once('?').unwrap_or((raw, ""));
    query.split('&').find_map(|pair| {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        (crate::connections::util::percent_decode(key) == name)
            .then(|| crate::connections::util::percent_decode(value))
    })
}

/// 签名请求 url = 请求的 scheme://host + path（Host 头带端口）。
fn signed_url(request: &crate::test_support::RecordedPost) -> String {
    let host = request.header("host").unwrap_or_default();
    let raw = request.request_line.split(' ').nth(1).unwrap_or_default();
    let (path, _) = raw.split_once('?').unwrap_or((raw, ""));
    format!("http://{host}{path}")
}

// ---- 推送探针握手全链路（官方无握手，探针语义同普通推送） ----

#[test]
fn handshake_posts_probe_json_and_accepts_200() {
    let (addr, rx) = start_single_server(
        move |request| {
            // 接收侧按官方五步复算（§7.7 字段级待核验下的同构口径）：
            // sig = SHA1(HEX(url?consumer_key=…&timestamp=… + secret))
            let sig = query_param(&request.request_line, "sig").expect("应带 sig 参数");
            let params = vec![
                ("consumer_key".to_string(), "7284397484".to_string()),
                (
                    "timestamp".to_string(),
                    query_param(&request.request_line, "timestamp").expect("应带 timestamp"),
                ),
            ];
            assert_eq!(sig, recompute_sig(&signed_url(request), &params));
            // 探针即官方订单状态核验样本（§5.2 载荷逐字）
            assert_eq!(request.body, GOLDEN_PROBE_PLAINTEXT);
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let url = format!("http://{addr}/webhooks/eleme");
    let config = eleme_config(url.clone());
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("推送探针"), "{outcome:?}");
    assert!(outcome.message.contains("200"), "{outcome:?}");
    assert!(outcome.message.contains("SHA1("), "{outcome:?}");

    // 请求侧逐项核对官方协议要素（§4.1 系统参数一律放 Query String；JSON
    // 推送 Content-Type: application/json）
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(request.header("content-type").as_deref(), Some("application/json"));
    assert_eq!(request.body, GOLDEN_PROBE_PLAINTEXT);
    let sig = query_param(&request.request_line, "sig").unwrap();
    let params = vec![
        ("consumer_key".to_string(), "7284397484".to_string()),
        (
            "timestamp".to_string(),
            query_param(&request.request_line, "timestamp").unwrap(),
        ),
    ];
    assert_eq!(recompute_sig(&url, &params), sig);
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
    let config = eleme_config(format!("http://{addr}/webhooks/eleme"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("500"), "{outcome:?}");
    assert!(outcome.message.contains("推送探针"), "{outcome:?}");
}

// ---- JSON 推送直发全链路 ----

#[test]
fn dispatch_posts_json_verbatim_with_query_params_and_snapshots() {
    let (addr, rx) = start_single_server(
        |request| {
            let sig = query_param(&request.request_line, "sig").expect("应带 sig 参数");
            assert!(!sig.is_empty());
            // 系统参数走 Query（§4.1），body 即业务明文
            assert!(query_param(&request.request_line, "consumer_key").is_some());
            assert!(query_param(&request.request_line, "timestamp").is_some());
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let config = eleme_config(format!("http://{addr}/webhooks/eleme"));

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_PROBE_PLAINTEXT);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.error, None);
    assert_eq!(outcome.reply, None);
    // 明文逐字节透传（ADR-0001）；订单号快照取 eleme_order_id；签名快照即
    // sig 参数（40 位小写 hex）
    assert_eq!(outcome.request_body.as_deref(), Some(GOLDEN_PROBE_PLAINTEXT));
    assert_eq!(outcome.msg_id, "12637645858619059");
    assert_eq!(outcome.signature.len(), 40);
    assert!(
        outcome
            .signature
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase())
    );
    // timestamp 快照落官方形态（十进制 UNIX 秒）
    let timestamp = outcome.timestamp.clone().expect("应带 timestamp 快照");
    assert!(
        !timestamp.is_empty() && timestamp.chars().all(|c| c.is_ascii_digit()),
        "UNIX 秒形态：{timestamp}"
    );

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    let url = format!("http://{addr}/webhooks/eleme");
    let params = vec![
        ("consumer_key".to_string(), "7284397484".to_string()),
        (
            "timestamp".to_string(),
            query_param(&request.request_line, "timestamp").unwrap(),
        ),
    ];
    assert_eq!(
        recompute_sig(&url, &params),
        query_param(&request.request_line, "sig").unwrap()
    );
}

// ---- H5 表单推送直发全链路 ----

#[test]
fn dispatch_posts_h5_form_signed_over_all_fields() {
    let (addr, rx) = start_single_server(
        |request| {
            // H5 表单推送签名覆盖表单全字段（sig 除外）+ 系统参数（§5.6
            // 「签名方式和平台请求饿了么方式一样」+ §4.1 步骤 1 POST 参数口径）
            assert_eq!(request.header("content-type").as_deref(), Some("application/x-www-form-urlencoded"));
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let config = eleme_config(format!("http://{addr}/webhooks/eleme"));

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_H5_FORM);

    assert_eq!(outcome.status, 200, "{outcome:?}");
    assert_eq!(outcome.msg_id, "12637645858619059");

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    // 业务字段原字节保留在 body；系统参数与 sig 在 Query
    assert!(request.body.starts_with("push_action=2&order_id="));
    assert!(!request.body.contains("sig="));
    assert_eq!(
        request.header("content-type").as_deref(),
        Some("application/x-www-form-urlencoded")
    );
    let mut params = crate::connections::util::form_pairs(&request.body);
    params.push(("consumer_key".to_string(), "7284397484".to_string()));
    params.push((
        "timestamp".to_string(),
        query_param(&request.request_line, "timestamp").unwrap(),
    ));
    assert_eq!(
        recompute_sig(&format!("http://{addr}/webhooks/eleme"), &params),
        query_param(&request.request_line, "sig").unwrap()
    );
}

#[test]
fn dispatch_strips_stale_sig_from_form_body_and_signs_fresh() {
    // 从真实推送拷贝的表单带旧 sig：剔除后按本连接密钥现算（官方「除 sig 外」）
    let body = "push_action=2&order_id=12637645858619059&sig=stale";
    let (addr, _rx) = start_single_server(
        |request| {
            assert!(query_param(&request.request_line, "sig").is_some());
            assert!(!request.body.contains("sig=stale"));
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let url = format!("http://{addr}/webhooks/eleme");
    let config = eleme_config(url);

    let outcome = Adapter.dispatch_event(&client(), &config, body);

    assert_eq!(outcome.status, 200, "{outcome:?}");
    let request_body = outcome.request_body.expect("应带请求快照");
    assert!(!request_body.contains("stale"));
    assert_eq!(request_body, "push_action=2&order_id=12637645858619059");
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
    let config = eleme_config(format!("http://{addr}/webhooks/eleme"));

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_PROBE_PLAINTEXT);

    assert_eq!(outcome.status, 500);
    assert_eq!(outcome.body, "boom");
    assert_eq!(outcome.error, None, "非 200 是回执事实，不是发送错误");
}

#[test]
fn dispatch_reports_timeout_with_official_retry_note() {
    // 官方口径实锤（§3.1/§5.1）：非 200 + ok 即判失败并重试，间隔/次数未给出
    // （§7.6）——超时文案附该口径；客户端 200ms 超时 vs 服务器 1s 延迟
    let slow =
        |_request: &crate::test_support::RecordedPost| ("HTTP/1.1 200 OK".to_string(), String::new());
    let (addr, _rx) = start_single_server(slow, Duration::from_secs(1));
    let config = eleme_config(format!("http://{addr}/webhooks/eleme"));

    let outcome = Adapter.dispatch_event(&quick_client(Duration::from_millis(200)), &config, "{}");

    assert_eq!(outcome.status, 0, "未收到响应时 status 为 0");
    let error = outcome.error.clone().expect("应有错误原因");
    assert!(error.contains("超时"), "{outcome:?}");
    assert!(error.contains("重试间隔/次数"), "{outcome:?}");
    assert_eq!(outcome.body, "");
}
