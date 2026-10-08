//! 握手与直发全链路（本地 TcpListener）：GET 四参握手（三参签名可复算 +
//! 原样回显成功/回显不符/非 2xx/超时）、JSON 直发（URL 三参签名 + 快照 + body
//! 逐字节透传）、非 200/超时回执。
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

/// 录制到的请求：query 参数集 + body。
#[derive(Clone)]
struct Recorded {
    query: HashMap<String, String>,
    body: String,
}

/// 起一个只处理一次请求的本地监听（GET 握手/POST 直发共用）；
/// responder 决定状态行与响应体。
fn start_request_server(
    responder: impl Fn(&HashMap<String, String>, &str) -> (String, String) + Send + 'static,
    delay: Duration,
) -> (SocketAddr, Receiver<Recorded>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let (tx, rx) = channel();
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let (head, body) = read_head_and_body(&mut stream);
        let request_line = head.lines().next().unwrap_or_default().to_string();
        let request = Recorded {
            query: query_of(&request_line),
            body,
        };
        tx.send(request.clone()).unwrap();
        std::thread::sleep(delay);
        let (status_line, response_body) = responder(&request.query, &request.body);
        let response = format!(
            "{status_line}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response_body}",
            response_body.len()
        );
        stream.write_all(response.as_bytes()).unwrap();
        stream.shutdown(Shutdown::Both).unwrap();
    });
    (addr, rx)
}

// ---- GET 四参握手全链路 ----

/// 忠实实现官方三步（事实库 §3.1）：① 参数已 urldecode ② 重算三参签名比对
/// ③ 原样回 echostr。
fn echo_ok(query: &HashMap<String, String>) -> (String, String) {
    let expect_sig =
        build_callback_signature(GOLDEN_APP_SECRET, &query["timestamp"], &query["nonce"]);
    assert_eq!(expect_sig, query["signature"], "三参签名应可复算");
    ("HTTP/1.1 200 OK".into(), query["echostr"].clone())
}

#[test]
fn handshake_succeeds_when_echostr_echoed_verbatim() {
    let (addr, rx) =
        start_request_server(|query, _body| echo_ok(query), Duration::ZERO);
    let config = weibo_config(format!("http://{addr}/webhooks/weibo"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("原样回显"), "{outcome:?}");

    // 请求侧逐项核对官方协议要素（事实库 §3.1 四参数 GET）
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    for key in ["signature", "timestamp", "nonce", "echostr"] {
        assert!(request.query.contains_key(key), "缺少 {key} 参数：{:?}", request.query);
    }
    assert_eq!(request.query["echostr"].len(), 10, "echostr 为随机字母数字明文");
    assert_eq!(
        request.query["signature"],
        build_callback_signature(
            GOLDEN_APP_SECRET,
            &request.query["timestamp"],
            &request.query["nonce"]
        )
    );
}

#[test]
fn handshake_fails_when_echostr_is_modified() {
    // 官方要求原样返回 echostr（回显被改动即绑定失败）
    let wrong_echo = |query: &HashMap<String, String>| {
        (
            "HTTP/1.1 200 OK".into(),
            format!("{}X", query["echostr"].clone()),
        )
    };
    let (addr, _rx) =
        start_request_server(move |query, _body| wrong_echo(query), Duration::ZERO);
    let config = weibo_config(format!("http://{addr}/webhooks/weibo"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("不一致"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_non_200() {
    let responder = |_query: &HashMap<String, String>, _body: &str| {
        ("HTTP/1.1 500 Internal Server Error".into(), "boom".into())
    };
    let (addr, _rx) = start_request_server(responder, Duration::ZERO);
    let config = weibo_config(format!("http://{addr}/webhooks/weibo"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("500"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_timeout() {
    // 官方 5 秒应答窗口（超时断开×3 重试）；客户端 200ms 超时 vs 服务器 1s 延迟
    let (addr, _rx) = start_request_server(
        |query, _body| echo_ok(query),
        Duration::from_secs(1),
    );
    let config = weibo_config(format!("http://{addr}/webhooks/weibo"));
    let outcome = Adapter.verify_handshake(&quick_client(Duration::from_millis(200)), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("超时"), "{outcome:?}");
}

// ---- JSON 事件直发全链路 ----

#[test]
fn dispatch_posts_json_with_signature_query_and_snapshots_elements() {
    let empty_receipt = |_query: &HashMap<String, String>, _body: &str| {
        // 回空串 = 官方语义「不处理、不重试」，正常应答的合法形态
        ("HTTP/1.1 200 OK".into(), String::new())
    };
    let (addr, rx) = start_request_server(empty_receipt, Duration::ZERO);
    let config = weibo_config(format!("http://{addr}/webhooks/weibo"));

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_EVENT_PLAINTEXT);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.body, "");
    assert_eq!(outcome.reply, None);
    assert_eq!(outcome.error, None);

    // 请求侧逐项核对官方协议要素（事实库 §3.2：推送同样带三参签名）
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    for key in ["signature", "timestamp", "nonce"] {
        assert!(request.query.contains_key(key), "缺少 {key} 参数：{:?}", request.query);
    }
    assert_eq!(
        request.query["signature"],
        build_callback_signature(
            GOLDEN_APP_SECRET,
            &request.query["timestamp"],
            &request.query["nonce"]
        )
    );
    // JSON 载荷逐字节透传（ADR-0001）
    assert_eq!(request.body, GOLDEN_EVENT_PLAINTEXT);
    // 快照与请求要素一致：nonce 落 msg_id（官方无唯一标识头可快照）
    assert_eq!(outcome.msg_id, request.query["nonce"]);
    assert_eq!(outcome.signature, request.query["signature"]);
    assert_eq!(
        outcome.timestamp.as_deref(),
        Some(request.query["timestamp"].as_str())
    );
    assert_eq!(outcome.request_body.as_deref(), Some(GOLDEN_EVENT_PLAINTEXT));
}

#[test]
fn dispatch_reports_non_200_status_and_body() {
    let boom = |_query: &HashMap<String, String>, _body: &str| {
        ("HTTP/1.1 500 Internal Server Error".into(), "boom".into())
    };
    let (addr, _rx) = start_request_server(boom, Duration::ZERO);
    let config = weibo_config(format!("http://{addr}/webhooks/weibo"));

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_EVENT_PLAINTEXT);

    assert_eq!(outcome.status, 500);
    assert_eq!(outcome.body, "boom");
    assert_eq!(outcome.reply, None);
    assert_eq!(outcome.error, None, "非 200 是回执事实，不是发送错误");
}

#[test]
fn dispatch_reports_timeout_without_response() {
    let slow = |_query: &HashMap<String, String>, _body: &str| {
        ("HTTP/1.1 200 OK".into(), String::new())
    };
    let (addr, _rx) = start_request_server(slow, Duration::from_secs(1));
    let config = weibo_config(format!("http://{addr}/webhooks/weibo"));

    let outcome = Adapter.dispatch_event(&quick_client(Duration::from_millis(200)), &config, "{}");

    assert_eq!(outcome.status, 0, "未收到响应时 status 为 0");
    let error = outcome.error.clone().expect("应有错误原因");
    assert!(error.contains("超时"), "{outcome:?}");
    assert_eq!(outcome.body, "");
}
