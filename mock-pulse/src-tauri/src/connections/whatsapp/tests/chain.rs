//! 握手与直发全链路（本地 TcpListener）：GET 三参握手（hub 三参可核 +
//! 200 裸回 challenge 成功/JSON 信封回包/非 200/超时）、JSON 直发
//! （X-Hub-Signature-256 头可由原始 body 复算 + body 逐字节透传 + wamid
//! 快照）、非 200/超时回执。
//! 协议原语经本渠道 Adapter 直调（收窄签名，配置判别由注册表路由保证）。

use std::collections::HashMap;
use std::io::Write;
use std::net::{Shutdown, SocketAddr, TcpListener};
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;

use crate::connections::ChannelAdapter;
use crate::test_support::{quick_client, read_head_and_body};

use super::*;

// ---- 配置与网络基建 ----

/// 表单风格 urldecode（握手参数经 query 传输，测试侧独立解码）。
fn urldecode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                if let Ok(byte) = u8::from_str_radix(hex, 16) {
                    out.push(byte);
                    i += 3;
                    continue;
                }
                out.push(b'%');
            }
            byte => out.push(byte),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn query_of(request_line: &str) -> HashMap<String, String> {
    let url = request_line.split_whitespace().nth(1).unwrap_or_default();
    let query = url.split_once('?').map(|(_, q)| q).unwrap_or_default();
    query
        .split('&')
        .filter(|kv| !kv.is_empty())
        .map(|kv| {
            let (key, value) = kv.split_once('=').unwrap_or((kv, ""));
            (urldecode(key), urldecode(value))
        })
        .collect()
}

/// 录制到的请求：请求行（GET/POST + 路径 + query）+ query 参数集 + body + 头。
#[derive(Clone)]
struct Recorded {
    request_line: String,
    query: HashMap<String, String>,
    body: String,
    head: String,
}

/// 起一个只处理一次请求的本地监听（GET 握手/POST 直发共用）；
/// responder 决定状态行与响应体。
fn start_request_server(
    responder: impl Fn(&Recorded) -> (String, String) + Send + 'static,
    delay: Duration,
) -> (SocketAddr, Receiver<Recorded>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let (tx, rx) = channel();
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let (head, body) = read_head_and_body(&mut stream);
        let request = Recorded {
            request_line: crate::test_support::request_line_of(&head),
            query: query_of(&crate::test_support::request_line_of(&head)),
            body,
            head,
        };
        tx.send(request.clone()).unwrap();
        std::thread::sleep(delay);
        let (status_line, response_body) = responder(&request);
        let response = format!(
            "{status_line}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response_body}",
            response_body.len()
        );
        stream.write_all(response.as_bytes()).unwrap();
        stream.shutdown(Shutdown::Both).unwrap();
    });
    (addr, rx)
}

// ---- GET 三参握手全链路（§3.2 配置保存即触发） ----

/// 忠实实现官方示例语义（事实库 §3.2 echo-bot 示例逐字）：hub.mode=subscribe
/// 且 hub.verify_token 与存量比对一致 → 200 + hub.challenge 裸值。
fn challenge_echo_ok(request: &Recorded) -> (String, String) {
    assert_eq!(
        request.query.get("hub.mode").map(String::as_str),
        Some("subscribe"),
        "hub.mode 恒为 subscribe：{:?}",
        request.query
    );
    assert_eq!(
        request.query.get("hub.verify_token").map(String::as_str),
        Some(GOLDEN_VERIFY_TOKEN),
        "verify_token 应与连接配置一致"
    );
    (
        "HTTP/1.1 200 OK".into(),
        request.query["hub.challenge"].clone(),
    )
}

#[test]
fn handshake_gets_three_params_and_accepts_bare_challenge() {
    let (addr, rx) =
        start_request_server(|request| challenge_echo_ok(request), Duration::ZERO);
    let config = whatsapp_config(format!("http://{addr}/webhooks/whatsapp"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("裸回"), "{outcome:?}");

    // 请求侧逐项核对官方协议要素（事实库 §3.2 三参 GET，无签名无加密）
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert!(
        request.request_line.starts_with("GET "),
        "握手应为 GET：{}",
        request.request_line
    );
    for key in ["hub.mode", "hub.challenge", "hub.verify_token"] {
        assert!(
            request.query.contains_key(key),
            "缺少 {key} 参数：{:?}",
            request.query
        );
    }
    // hub.challenge 为随机 int/字符串：本侧 16 位数字串、非固定值重放
    let challenge = request.query["hub.challenge"].clone();
    assert_eq!(challenge.len(), 16);
    assert!(challenge.bytes().all(|byte| byte.is_ascii_digit()));
    assert_eq!(request.body, "", "GET 握手无请求体");
}

#[test]
fn handshake_fails_when_challenge_wrapped_in_json() {
    // 官方常见坑（第三方互证）：回 {"hub.challenge": …} JSON 信封会失败
    let json_envelope = |request: &Recorded| {
        (
            "HTTP/1.1 200 OK".into(),
            format!(r#"{{"hub.challenge":"{}"}}"#, request.query["hub.challenge"]),
        )
    };
    let (addr, _rx) = start_request_server(json_envelope, Duration::ZERO);
    let config = whatsapp_config(format!("http://{addr}/webhooks/whatsapp"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("裸值"), "{outcome:?}");
}

#[test]
fn handshake_fails_when_challenge_modified() {
    // 官方要求原样返回 challenge（回显被改动即验证失败）
    let modified = |request: &Recorded| {
        (
            "HTTP/1.1 200 OK".into(),
            format!("{}X", request.query["hub.challenge"]),
        )
    };
    let (addr, _rx) = start_request_server(modified, Duration::ZERO);
    let config = whatsapp_config(format!("http://{addr}/webhooks/whatsapp"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("裸值"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_non_200() {
    // 官方示例：verify_token 不匹配回 403（任何非 200 即未通过）
    let forbidden = |_request: &Recorded| {
        ("HTTP/1.1 403 Forbidden".into(), String::new())
    };
    let (addr, _rx) = start_request_server(forbidden, Duration::ZERO);
    let config = whatsapp_config(format!("http://{addr}/webhooks/whatsapp"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("403"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_timeout() {
    // 官方无秒级应答 SLA（待核验(09-27)）；客户端 200ms 超时 vs 服务器 1s 延迟
    let (addr, _rx) = start_request_server(
        |request| challenge_echo_ok(request),
        Duration::from_secs(1),
    );
    let config = whatsapp_config(format!("http://{addr}/webhooks/whatsapp"));
    let outcome = Adapter.verify_handshake(&quick_client(Duration::from_millis(200)), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("超时"), "{outcome:?}");
}

// ---- JSON 事件直发全链路（X-Hub-Signature-256 头验签） ----

#[test]
fn dispatch_posts_json_with_signature_header_and_snapshots_wamid() {
    let (addr, rx) = start_request_server(
        |request| {
            // 接收侧按官方协议验签（§4.1）：头 X-Hub-Signature-256 可由原始
            // body 字节 + AppSecret 复算（常量时间比对由接收侧自保证）
            assert_eq!(
                request
                    .head
                    .lines()
                    .find_map(|line| line
                        .split_once(':')
                        .filter(|(key, _)| key.trim().eq_ignore_ascii_case("x-hub-signature-256"))
                        .map(|(_, value)| value.trim().to_string())),
                Some(x_hub_signature(&request.body, GOLDEN_APP_SECRET)),
                "X-Hub-Signature-256 头应可由原始 body 复算"
            );
            // 端点回 HTTP 200 即成功（正文无口径）
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let config = whatsapp_config(format!("http://{addr}/webhooks/whatsapp"));

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_INBOUND_PLAINTEXT);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.error, None);
    assert_eq!(outcome.reply, None);
    // 明文逐字节透传（ADR-0001）
    assert_eq!(
        outcome.request_body.as_deref(),
        Some(GOLDEN_INBOUND_PLAINTEXT)
    );
    // 幂等键快照：wamid 取自明文载荷 messages[].id；签名快照即完整头值
    assert_eq!(outcome.msg_id, GOLDEN_INBOUND_WAMID);
    assert_eq!(
        outcome.signature,
        x_hub_signature(GOLDEN_INBOUND_PLAINTEXT, GOLDEN_APP_SECRET)
    );
    // Verify token 不参与 POST 验签：请求无 query、无时间戳要素
    assert_eq!(outcome.timestamp, None);

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert!(
        !request.request_line.contains('?'),
        "POST 事件直发不带 query：{}",
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
    assert_eq!(request.body, GOLDEN_INBOUND_PLAINTEXT);
}

#[test]
fn dispatch_outbound_status_snapshots_statuses_wamid() {
    // outbound 状态载荷的幂等键快照取 statuses[].id（三处同源）
    let empty_receipt =
        |_request: &Recorded| ("HTTP/1.1 200 OK".into(), String::new());
    let (addr, _rx) = start_request_server(empty_receipt, Duration::ZERO);
    let config = whatsapp_config(format!("http://{addr}/webhooks/whatsapp"));

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_DELIVERED_PLAINTEXT);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.msg_id, GOLDEN_DELIVERED_WAMID);
}

#[test]
fn dispatch_reports_non_200_status_and_body() {
    let boom = |_request: &Recorded| {
        (
            "HTTP/1.1 500 Internal Server Error".into(),
            "boom".to_string(),
        )
    };
    let (addr, _rx) = start_request_server(boom, Duration::ZERO);
    let config = whatsapp_config(format!("http://{addr}/webhooks/whatsapp"));

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_INBOUND_PLAINTEXT);

    assert_eq!(outcome.status, 500);
    assert_eq!(outcome.body, "boom");
    assert_eq!(outcome.error, None, "非 200 是回执事实，不是发送错误");
}

#[test]
fn dispatch_reports_timeout_with_retry_note() {
    // 官方非 200/不可达即递减重试最长 7 天；客户端 200ms 超时 vs 服务器 1s 延迟
    let slow = |_request: &Recorded| ("HTTP/1.1 200 OK".into(), String::new());
    let (addr, _rx) = start_request_server(slow, Duration::from_secs(1));
    let config = whatsapp_config(format!("http://{addr}/webhooks/whatsapp"));

    let outcome =
        Adapter.dispatch_event(&quick_client(Duration::from_millis(200)), &config, "{}");

    assert_eq!(outcome.status, 0, "未收到响应时 status 为 0");
    let error = outcome.error.clone().expect("应有错误原因");
    assert!(error.contains("超时"), "{outcome:?}");
    assert!(error.contains("7 天"), "{outcome:?}");
    assert_eq!(outcome.body, "");
}
