//! 探针握手与直发全链路（本地 TcpListener）：推送探针握手（sig 可由表单全
//! 字段解码值 + 请求 url 复算 + 200/非 2xx）、表单直发（明文逐字节透传 +
//! 系统级参数与 sig 尾部追加 + 订单号快照 + timestamp 快照 + 旧 sig 现算）、
//! 超时回执、配置判别。

use std::time::Duration;

use crate::connections::ConnectionConfig;
use crate::test_support::{quick_client, start_single_server};

use super::*;

/// 接收侧按官方签名规则复算（§4.1）：表单全字段（sig 除外）解码值按字母序
/// k=v & 连接，拼 url?…+secret——与适配器同一原语，互为对拍。
fn recompute_sig(url: &str, body: &str) -> String {
    let mut pairs = form_pairs(body);
    pairs.retain(|(key, _)| key != "sig");
    let borrowed: Vec<(&str, &str)> =
        pairs.iter().map(|(key, value)| (key.as_str(), value.as_str())).collect();
    mt_sign(url, &borrowed, GOLDEN_SECRET)
}

fn body_param<'a>(body: &'a str, name: &str) -> Option<&'a str> {
    body.split('&').find_map(|pair| {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        (key == name).then_some(value)
    })
}

// ---- 推送探针握手全链路（官方验证握手正文待核验，探针语义同普通推送） ----

#[test]
fn handshake_posts_probe_form_and_accepts_200() {
    let (addr, rx) = start_single_server(
        move |request| {
            // 接收侧按官方签名规则复算（§4.1）：表单全字段（sig 除外）解码值
            // 排序拼串、url? 前缀、secret 尾拼
            let sig = body_param(&request.body, "sig").expect("应带 sig 参数");
            // 待签 url = 请求的 scheme://host + path（Host 头带端口）
            let host = request.header("host").unwrap_or_default();
            let url = format!(
                "http://{host}{}",
                request_path(&request.request_line)
            );
            assert_eq!(sig, recompute_sig(&url, &request.body));
            // 探针即官方订单核验样本（§5.3 字段值逐字）+ 系统级参数
            assert!(request.body.contains(GOLDEN_PROBE_BODY));
            assert!(request.body.contains("app_id=1235123121"));
            assert!(request.body.contains("timestamp="));
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let url = format!("http://{addr}/webhooks/meituan");
    let config = meituan_config(url.clone());
    let outcome = verify_handshake(&client(), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("推送探针"), "{outcome:?}");
    assert!(outcome.message.contains("200"), "{outcome:?}");
    assert!(outcome.message.contains("MD5("), "{outcome:?}");

    // 请求侧逐项核对官方协议要素（§3.1 表单 POST + Content-Type:
    // application/x-www-form-urlencoded）
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(
        request.header("content-type").as_deref(),
        Some("application/x-www-form-urlencoded")
    );
    assert_eq!(
        recompute_sig(&url, &request.body),
        body_param(&request.body, "sig").unwrap()
    );
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
    let config = meituan_config(format!("http://{addr}/webhooks/meituan"));
    let outcome = verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("500"), "{outcome:?}");
    assert!(outcome.message.contains("推送探针"), "{outcome:?}");
}

// ---- 表单直发全链路 ----

#[test]
fn dispatch_posts_form_with_appended_params_and_snapshots() {
    let (addr, rx) = start_single_server(
        |request| {
            let sig = body_param(&request.body, "sig").expect("应带 sig 参数");
            assert!(!sig.is_empty());
            // 追加系统级参数 + sig，业务明文段在前（官方推送参数未排序）
            assert!(request.body.starts_with(GOLDEN_ORDER_BODY));
            assert!(request.body.contains("&app_id=1235123121"));
            assert!(request.body.contains("&timestamp="));
            assert!(request.body.contains("&sig="));
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let config = meituan_config(format!("http://{addr}/webhooks/meituan"));

    let outcome = dispatch_event(&client(), &config, GOLDEN_ORDER_BODY);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.error, None);
    assert_eq!(outcome.reply, None);
    // 明文逐字节透传（ADR-0001）：请求快照 = 原文明文 + 追加段
    let request_body = outcome.request_body.clone().expect("应带请求快照");
    assert!(request_body.starts_with(GOLDEN_ORDER_BODY));
    // 订单号快照：order_id 取自解码 kv；签名快照即 sig 参数（32 位小写 hex）
    assert_eq!(outcome.msg_id, "27061900338318741");
    assert_eq!(outcome.signature.len(), 32);
    assert!(outcome
        .signature
        .chars()
        .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
    // timestamp 快照落官方形态（十进制 UNIX 秒）
    let timestamp = outcome.timestamp.clone().expect("应带 timestamp 快照");
    assert!(
        !timestamp.is_empty() && timestamp.chars().all(|c| c.is_ascii_digit()),
        "UNIX 秒形态：{timestamp}"
    );

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    // 接收侧复算：全字段（sig 除外）解码值 + 请求 url
    let url = format!("http://{addr}/webhooks/meituan");
    assert_eq!(
        recompute_sig(&url, &request.body),
        body_param(&request.body, "sig").unwrap()
    );
}

#[test]
fn dispatch_signs_decoded_values_and_reuses_payload_app_id() {
    // 明文已带 app_id/timestamp 时让位（不重复追加），中文按解码原文参签：
    // 接收侧用解码值复算必过
    let body = "app_id=999&timestamp=1389751221&wm_poi_name=%E8%8D%AF%E5%93%8101%E5%BA%97&order_id=27061900338318741";
    let (addr, rx) = start_single_server(
        |request| {
            assert!(request.body.contains("app_id=999"));
            assert!(request.body.contains("timestamp=1389751221"));
            assert!(request.body.contains("&sig="));
            assert!(!request.body.contains("app_id=1235123121"));
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let url = format!("http://{addr}/webhooks/meituan");
    let config = meituan_config(url.clone());

    let outcome = dispatch_event(&client(), &config, body);

    assert_eq!(outcome.status, 200, "{outcome:?}");
    assert_eq!(outcome.msg_id, "27061900338318741");
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(
        recompute_sig(&url, &request.body),
        body_param(&request.body, "sig").unwrap()
    );
    // 追加段只含 sig（app_id/timestamp 已在明文）
    let request_body = outcome.request_body.expect("应带请求快照");
    assert!(request_body.starts_with(body));
    assert!(request_body.ends_with(&format!("&sig={}", outcome.signature)));
}

#[test]
fn dispatch_strips_stale_sig_and_signs_fresh() {
    // 从真实推送拷贝的表单带旧 sig：剔除后按本连接密钥现算（官方「sig 除外」）
    let body = "app_poi_code=668921&order_id=27061900338318741&sig=stale";
    let (addr, _rx) = start_single_server(
        |request| {
            assert!(request.body.contains("&sig="));
            assert!(!request.body.contains("sig=stale"));
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let url = format!("http://{addr}/webhooks/meituan");
    let config = meituan_config(url.clone());

    let outcome = dispatch_event(&client(), &config, body);

    assert_eq!(outcome.status, 200, "{outcome:?}");
    let request_body = outcome.request_body.expect("应带请求快照");
    // 旧 sig 不在发送体内，新 sig 可由接收侧复算
    assert!(!request_body.contains("stale"));
    assert_eq!(
        recompute_sig(&url, &request_body),
        body_param(&request_body, "sig").unwrap()
    );
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
    let config = meituan_config(format!("http://{addr}/webhooks/meituan"));

    let outcome = dispatch_event(&client(), &config, GOLDEN_ORDER_BODY);

    assert_eq!(outcome.status, 500);
    assert_eq!(outcome.body, "boom");
    assert_eq!(outcome.error, None, "非 200 是回执事实，不是发送错误");
}

#[test]
fn dispatch_reports_timeout_with_official_retry_note() {
    // 官方口径实锤（§3.2/§3.3）：订单类 2 秒内应答、失败 1 分钟×3 重试——
    // 超时文案附该口径；客户端 200ms 超时 vs 服务器 1s 延迟
    let slow =
        |_request: &crate::test_support::RecordedPost| ("HTTP/1.1 200 OK".to_string(), String::new());
    let (addr, _rx) = start_single_server(slow, Duration::from_secs(1));
    let config = meituan_config(format!("http://{addr}/webhooks/meituan"));

    let outcome = dispatch_event(&quick_client(Duration::from_millis(200)), &config, "{}");

    assert_eq!(outcome.status, 0, "未收到响应时 status 为 0");
    let error = outcome.error.clone().expect("应有错误原因");
    assert!(error.contains("超时"), "{outcome:?}");
    assert!(error.contains("1 分钟×3"), "{outcome:?}");
    assert_eq!(outcome.body, "");
}

// ---- 配置判别 ----

#[test]
fn dispatch_and_handshake_reject_non_meituan_config() {
    let config = ConnectionConfig::Jingdong {
        url: "http://127.0.0.1:1/hook".into(),
        app_key: "yourappkey".into(),
        app_secret: "yourappSecret".into(),
    };

    let outcome = dispatch_event(&client(), &config, "a=1");
    assert_eq!(outcome.status, 0);
    assert!(outcome.error.unwrap().contains("不是美团渠道"));

    let handshake = verify_handshake(&client(), &config);
    assert!(!handshake.ok);
    assert!(handshake.message.contains("不是美团渠道"));
}

// ---- 请求行/body 解析（本文件断言专用，不进协议原语） ----

fn request_path(request_line: &str) -> &str {
    // 请求行形如 `POST /webhooks/meituan?... HTTP/1.1`
    let raw = request_line.split(' ').nth(1).unwrap_or_default();
    let (path, _) = raw.split_once('?').unwrap_or((raw, ""));
    path
}
