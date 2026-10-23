//! 握手与双通道直发全链路（本地 TcpListener）：
//! 小程序 GET 四参握手（三参签名可复算 + 原样回显成功/回显不符/非 2xx/超时）、
//! 加密信封直发（信封可独立验签解密 + 回执 success + 快照）、ark 数组直发
//! （数组包裹逐字节核对 + 官方应答）、ark 推送探针（成功/应答不合规）。
//! 协议原语经本渠道 Adapter 直调（收窄签名，配置判别由注册表路由保证）。

use std::collections::HashMap;
use std::io::Write;
use std::net::{Shutdown, SocketAddr, TcpListener};
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;

use crate::connections::{ChannelAdapter, ConnectionConfig};
use crate::test_support::{quick_client, read_head_and_body};

use super::*;

// ---- 网络基建 ----

/// 表单风格 urldecode（GET 握手参数经 query 传输，测试侧独立解码）。
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

/// 录制到的请求：query 参数集 + body。
#[derive(Clone)]
struct Recorded {
    query: HashMap<String, String>,
    body: String,
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
        let request_line = head.lines().next().unwrap_or_default().to_string();
        let url = request_line.split_whitespace().nth(1).unwrap_or_default();
        let query = url.split_once('?').map(|(_, q)| q).unwrap_or_default();
        let request = Recorded {
            query: query
                .split('&')
                .filter(|kv| !kv.is_empty())
                .map(|kv| {
                    let (key, value) = kv.split_once('=').unwrap_or((kv, ""));
                    (urldecode(key), urldecode(value))
                })
                .collect(),
            body,
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

// ---- 小程序通道 GET 四参握手全链路 ----

/// 忠实实现官方三步（事实库 §10.4）：① 参数已 urldecode ② 重算三参签名比对
/// ③ 原样回 echostr。
fn echo_ok(request: &Recorded) -> (String, String) {
    let expect_sig = build_callback_signature(
        GOLDEN_TOKEN,
        &request.query["timestamp"],
        &request.query["nonce"],
    );
    assert_eq!(expect_sig, request.query["signature"], "三参签名应可复算");
    ("HTTP/1.1 200 OK".into(), request.query["echostr"].clone())
}

#[test]
fn handshake_succeeds_when_echostr_echoed_verbatim() {
    let (addr, rx) = start_request_server(echo_ok, Duration::ZERO);
    let config = miniapp_config(format!("http://{addr}/callback"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("原样回显"), "{outcome:?}");

    // 请求侧逐项核对官方协议要素（事实库 §10.4：四 query 参数，非请求头）
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    for key in ["signature", "timestamp", "nonce", "echostr"] {
        assert!(
            request.query.contains_key(key),
            "缺少 {key} 参数：{:?}",
            request.query
        );
    }
    assert_eq!(
        request.query["echostr"].len(),
        32,
        "echostr 为随机 hex 明文"
    );
    assert_eq!(
        request.query["signature"],
        build_callback_signature(
            GOLDEN_TOKEN,
            &request.query["timestamp"],
            &request.query["nonce"]
        )
    );
}

#[test]
fn handshake_fails_when_echostr_is_modified() {
    // 官方要求原样返回 echostr（回显被改动即绑定失败）
    let wrong_echo = |request: &Recorded| {
        (
            "HTTP/1.1 200 OK".into(),
            format!("{}X", request.query["echostr"].clone()),
        )
    };
    let (addr, _rx) = start_request_server(wrong_echo, Duration::ZERO);
    let config = miniapp_config(format!("http://{addr}/callback"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("不一致"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_non_200() {
    let responder =
        |_request: &Recorded| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
    let (addr, _rx) = start_request_server(responder, Duration::ZERO);
    let config = miniapp_config(format!("http://{addr}/callback"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("500"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_timeout() {
    // 官方 5 秒应答窗口（超时断开×3 重试）；客户端 200ms 超时 vs 服务器 1s 延迟
    let (addr, _rx) = start_request_server(echo_ok, Duration::from_secs(1));
    let config = miniapp_config(format!("http://{addr}/callback"));
    let outcome = Adapter.verify_handshake(&quick_client(Duration::from_millis(200)), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("超时"), "{outcome:?}");
}

// ---- 小程序通道加密信封直发全链路 ----

#[test]
fn dispatch_posts_encrypted_envelope_and_snapshots_elements() {
    let success_receipt = |_request: &Recorded| {
        // 官方应答（§10.5）：直接回复 success（不带引号）
        ("HTTP/1.1 200 OK".into(), "success".into())
    };
    let (addr, rx) = start_request_server(success_receipt, Duration::ZERO);
    let config = miniapp_config(format!("http://{addr}/callback"));

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_MESSAGE_PLAINTEXT);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.body, "success");
    assert_eq!(outcome.error, None);

    // 请求侧逐项核对官方协议要素（事实库 §11.2/§11.3：签名在 body 内）
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    let parsed: serde_json::Value = serde_json::from_str(&request.body).unwrap();
    let encrypt = parsed["Encrypt"].as_str().unwrap();
    let msg_signature = parsed["MsgSignature"].as_str().unwrap();
    let timestamp = parsed["Timestamp"].as_i64().unwrap().to_string();
    let nonce = parsed["Nonce"].as_str().unwrap();
    // MsgSignature 四参可复算（token/nonce/encrypt 为字符串、timestamp 为数字）
    assert_eq!(
        msg_signature,
        build_msg_signature(GOLDEN_TOKEN, &timestamp, nonce, encrypt)
    );
    // 信封可独立解密回黄金样本明文（尾部 receiveid = AppId）
    let decrypted =
        crate::connections::wecom::crypto::decrypt_msg(GOLDEN_ENCODING_AES_KEY, encrypt).unwrap();
    assert_eq!(decrypted.msg, GOLDEN_MESSAGE_PLAINTEXT.as_bytes());
    assert_eq!(decrypted.receiveid, GOLDEN_APP_ID);
    // 快照与请求要素一致：nonce 落 msg_id、MsgSignature 落 signature
    assert_eq!(outcome.msg_id, nonce);
    assert_eq!(outcome.signature, msg_signature);
    assert_eq!(outcome.timestamp.as_deref(), Some(timestamp.as_str()));
    assert_eq!(outcome.request_body.as_deref(), Some(request.body.as_str()));
}

#[test]
fn dispatch_reports_non_200_status_and_body() {
    let boom = |_request: &Recorded| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
    let (addr, _rx) = start_request_server(boom, Duration::ZERO);
    let config = miniapp_config(format!("http://{addr}/callback"));

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_MESSAGE_PLAINTEXT);

    assert_eq!(outcome.status, 500);
    assert_eq!(outcome.body, "boom");
    assert_eq!(outcome.error, None, "非 200 是回执事实，不是发送错误");
}

#[test]
fn dispatch_reports_timeout_without_response() {
    let slow = |_request: &Recorded| ("HTTP/1.1 200 OK".into(), String::new());
    let (addr, _rx) = start_request_server(slow, Duration::from_secs(1));
    let config = miniapp_config(format!("http://{addr}/callback"));

    let outcome = Adapter.dispatch_event(&quick_client(Duration::from_millis(200)), &config, "{}");

    assert_eq!(outcome.status, 0, "未收到响应时 status 为 0");
    let error = outcome.error.clone().expect("应有错误原因");
    assert!(error.contains("超时"), "{outcome:?}");
    assert_eq!(outcome.body, "");
}

#[test]
fn dispatch_fails_fast_on_bad_aes_key_without_sending() {
    // EncodingAESKey 形状非法：加密封装前置失败，请求不发出（status 0 + 原因）
    let config = ConnectionConfig::Xiaohongshu {
        url: "http://127.0.0.1:1/callback".into(),
        system: XiaohongshuSystem::Miniapp,
        token: GOLDEN_TOKEN.into(),
        encoding_aes_key: "short-key".into(),
        app_id: GOLDEN_APP_ID.into(),
    };
    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_MESSAGE_PLAINTEXT);

    assert_eq!(outcome.status, 0);
    let error = outcome.error.clone().expect("应有封装失败原因");
    assert!(error.contains("加密封装失败"), "{outcome:?}");
    assert_eq!(outcome.request_body, None);
}

// ---- 电商 ark 通道全链路 ----

#[test]
fn ark_dispatch_wraps_envelope_into_official_array_and_reads_receipt() {
    let official_receipt = |request: &Recorded| {
        // body 为官方批量数组（前端单条信封包裹成单元素数组，逐字节核对）
        assert_eq!(
            request.body,
            format!("[{GOLDEN_ARK_ENVELOPE}]"),
            "ark 推送 body 应为 JSON 数组包裹单条信封"
        );
        // 官方应答（§2.1/§5.4 逐字）
        (
            "HTTP/1.1 200 OK".into(),
            r#"{"success":true,"error_code":0,"error_msg":""}"#.into(),
        )
    };
    let (addr, _rx) = start_request_server(official_receipt, Duration::ZERO);
    let config = ark_config(format!("http://{addr}/callback"));

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_ARK_ENVELOPE);

    assert_eq!(outcome.status, 200);
    assert_eq!(
        outcome.body,
        r#"{"success":true,"error_code":0,"error_msg":""}"#
    );
    assert_eq!(outcome.error, None);
    // ark 无签名/唯一标识要素（官方无签名头），快照不落值；数组 body 落快照
    assert_eq!(outcome.msg_id, "");
    assert_eq!(outcome.signature, "");
    assert_eq!(outcome.timestamp, None);
    assert_eq!(
        outcome.request_body.as_deref(),
        Some(format!("[{GOLDEN_ARK_ENVELOPE}]").as_str())
    );
}

#[test]
fn ark_probe_handshake_succeeds_on_official_reply() {
    let official_receipt = |request: &Recorded| {
        // 探针 body = 官方构造示例（数组包裹单元素）
        let parsed: serde_json::Value =
            serde_json::from_str(request.body.trim_start_matches('[').trim_end_matches(']'))
                .unwrap();
        assert_eq!(parsed["msgTag"], "msg_fulfillment_status_change");
        (
            "HTTP/1.1 200 OK".into(),
            r#"{"success":true,"error_code":0,"error_msg":""}"#.into(),
        )
    };
    let (addr, _rx) = start_request_server(official_receipt, Duration::ZERO);
    let config = ark_config(format!("http://{addr}/callback"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("探针成功"), "{outcome:?}");
}

#[test]
fn ark_probe_handshake_fails_on_non_official_reply() {
    let wrong_reply = |_request: &Recorded| {
        (
            "HTTP/1.1 200 OK".into(),
            r#"{"success":false,"error_code":500,"error_msg":"boom"}"#.into(),
        )
    };
    let (addr, _rx) = start_request_server(wrong_reply, Duration::ZERO);
    let config = ark_config(format!("http://{addr}/callback"));
    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("success=true"), "{outcome:?}");
}
