//! 探针握手与直发全链路（本地 TcpListener）：推送探针握手（JOS 签名可由原始
//! body + query 参数复算 + 200/非 2xx）、明文直发（系统参数 query + body 逐字节
//! 透传 + 业务单号快照 + timestamp 快照）、超时回执。
//! 协议原语经本渠道 Adapter 直调（收窄签名，配置判别由注册表路由保证）。

use std::time::Duration;

use crate::connections::ChannelAdapter;
use crate::test_support::{quick_client, start_single_server};

use super::*;

// ---- 推送探针握手全链路（官方首次验证握手待核验，探针语义同普通推送） ----

#[test]
fn handshake_posts_probe_sample_and_accepts_200() {
    let (addr, rx) = start_single_server(
        |request| {
            // 接收侧按官方签名规则复算（§4.1）：360buy_param_json = body 原文，
            // 与 query 里的 app_key/timestamp/v 一起字母序拼接、secret 夹两端
            let query = request_line_query(&request.request_line);
            let timestamp = query_param(&query, "timestamp").expect("应带 timestamp 参数");
            let app_key = query_param(&query, "app_key").expect("应带 app_key 参数");
            let sign = query_param(&query, "sign").expect("应带 sign 参数");
            assert_eq!(query_param(&query, "v"), Some("2.0".to_string()));
            assert_eq!(
                sign,
                jos_sign(
                    &[
                        ("360buy_param_json", &request.body[..]),
                        ("app_key", &app_key[..]),
                        ("timestamp", &timestamp[..]),
                        ("v", "2.0"),
                    ],
                    GOLDEN_APP_SECRET,
                )
            );
            // 探针即官方状态枚举样本明文（§5.1 锚定，逐字）
            assert_eq!(request.body, GOLDEN_PROBE_PLAINTEXT);
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let config = jingdong_config(format!("http://{addr}/webhooks/jingdong"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("推送探针"), "{outcome:?}");
    assert!(outcome.message.contains("200"), "{outcome:?}");
    assert!(outcome.message.contains("UPPER(MD5"), "{outcome:?}");

    // 请求侧逐项核对官方协议要素（§4.2 系统参数走 query + Content-Type: application/json）
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
    let config = jingdong_config(format!("http://{addr}/webhooks/jingdong"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("500"), "{outcome:?}");
    assert!(outcome.message.contains("推送探针"), "{outcome:?}");
}

// ---- 明文 JSON 直发全链路 ----

#[test]
fn dispatch_posts_plaintext_with_jos_query_and_snapshots_elements() {
    let (addr, rx) = start_single_server(
        |request| {
            let query = request_line_query(&request.request_line);
            let timestamp = query_param(&query, "timestamp").expect("应带 timestamp 参数");
            let sign = query_param(&query, "sign").expect("应带 sign 参数");
            assert_eq!(
                sign,
                jos_sign(
                    &[
                        ("360buy_param_json", &request.body[..]),
                        ("app_key", GOLDEN_APP_KEY),
                        ("timestamp", &timestamp[..]),
                        ("v", "2.0"),
                    ],
                    GOLDEN_APP_SECRET,
                )
            );
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let config = jingdong_config(format!("http://{addr}/webhooks/jingdong"));

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_ORDER_PLAINTEXT);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.error, None);
    assert_eq!(outcome.reply, None);
    // 明文逐字节透传（ADR-0001）
    assert_eq!(
        outcome.request_body.as_deref(),
        Some(GOLDEN_ORDER_PLAINTEXT)
    );
    // 业务单号快照：order_id 取自明文载荷；签名快照即 sign 参数（32 位大写 hex）
    assert_eq!(outcome.msg_id, "110770592823138");
    assert_eq!(outcome.signature.len(), 32);
    assert!(outcome
        .signature
        .chars()
        .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_lowercase()));
    // timestamp 快照落官方格式（10 分钟窗口要素），日期部分与当前时刻同日
    let timestamp = outcome.timestamp.clone().expect("应带 timestamp 快照");
    assert_eq!(timestamp.len(), 19);
    assert!(timestamp.as_bytes()[4] == b'-' && timestamp.as_bytes()[10] == b' ');
    assert_eq!(
        date_part_of(&timestamp),
        date_part_of(&jos_timestamp(now_secs()))
    );

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(request.body, GOLDEN_ORDER_PLAINTEXT);
}

#[test]
fn dispatch_snapshots_business_id_per_template() {
    // 订单推送取 order_id、咚咚 push2 取 orderId（serviceId 前置不落值的场景由
    // push2 五参数样本锚定：orderId 为快照取值——message_id_of 以 order_id 优先，
    // push2 样本无 order_id 蛇形键故落 orderId）
    let cases = [
        (GOLDEN_ORDER_PLAINTEXT, "110770592823138"),
        (GOLDEN_PUSH2_PLAINTEXT, "123456789"),
    ];
    for (plaintext, expected) in cases {
        let (addr, _rx) = start_single_server(
            |_request| ("HTTP/1.1 200 OK".into(), String::new()),
            Duration::ZERO,
        );
        let config = jingdong_config(format!("http://{addr}/webhooks/jingdong"));
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
    let config = jingdong_config(format!("http://{addr}/webhooks/jingdong"));

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_ORDER_PLAINTEXT);

    assert_eq!(outcome.status, 500);
    assert_eq!(outcome.body, "boom");
    assert_eq!(outcome.error, None, "非 200 是回执事实，不是发送错误");
}

#[test]
fn dispatch_reports_timeout_with_pending_retry_note() {
    // 官方重试口径待核验(09-27)：超时文案附待核验提示；客户端 200ms 超时 vs
    // 服务器 1s 延迟
    let slow = |_request: &crate::test_support::RecordedPost| {
        ("HTTP/1.1 200 OK".to_string(), String::new())
    };
    let (addr, _rx) = start_single_server(slow, Duration::from_secs(1));
    let config = jingdong_config(format!("http://{addr}/webhooks/jingdong"));

    let outcome = Adapter.dispatch_event(&quick_client(Duration::from_millis(200)), &config, "{}");

    assert_eq!(outcome.status, 0, "未收到响应时 status 为 0");
    let error = outcome.error.clone().expect("应有错误原因");
    assert!(error.contains("超时"), "{outcome:?}");
    assert!(error.contains("待核验"), "{outcome:?}");
    assert_eq!(outcome.body, "");
}

// ---- 请求行/query 解析（本文件断言专用，不进协议原语） ----

fn request_line_query(request_line: &str) -> String {
    // 请求行形如 `POST /webhooks/jingdong?app_key=…&… HTTP/1.1`
    let raw = request_line.split(' ').nth(1).unwrap_or_default();
    raw.split_once('?')
        .map(|(_, query)| query)
        .unwrap_or("")
        .to_string()
}

fn query_param(query: &str, name: &str) -> Option<String> {
    for pair in query.split('&') {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        if key == name {
            // form-urlencoded 还原：+ 为空格、%XX 为字节（timestamp 的冒号即 %3A）
            // ——复用 util 单点（Reuse-first 审计退件：测试内曾逐字重复一份）
            return Some(crate::connections::util::percent_decode(value));
        }
    }
    None
}

/// 官方格式 timestamp 的日期部分（仅形态断言用：与当前时刻同日即视为同值）。
fn date_part_of(timestamp: &str) -> String {
    timestamp.split(' ').next().unwrap_or_default().to_string()
}
