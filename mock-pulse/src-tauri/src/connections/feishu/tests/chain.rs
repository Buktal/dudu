//! 握手与直发全链路（本地 TcpListener）：明文/加密双格式 url_verification
//! 握手（成功/回显不符/非 200/超时）、明文逐字节直发（无签名头）、加密信封
//! 直发（可独立解密 + 签名复算）、非 200 与超时。
//! 协议原语经本渠道 Adapter 直调（收窄签名，配置判别由注册表路由保证）。

use std::time::Duration;

use crate::connections::ChannelAdapter;
use crate::connections::util::sha256_hex;
use crate::test_support::{start_single_server, RecordedPost};

use super::*;

// ---- url_verification 握手全链路 ----

#[test]
fn plain_handshake_echoes_challenge_without_signature_headers() {
    let (addr, rx) = start_single_server(echo_challenge, Duration::ZERO);
    let config = feishu_plain_config(format!("http://{addr}/webhooks/feishu"));

    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("原样回显"), "{outcome:?}");

    // 请求侧逐项核对官方协议要素（事实库 §3.2 三参明文 + §4.1 明文无签名）
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(
        request.header("Content-Type").as_deref(),
        Some("application/json")
    );
    assert!(
        request.header("X-Lark-Signature").is_none(),
        "明文模式无签名头（签名算法含 encrypt_key）"
    );
    let parsed: serde_json::Value = serde_json::from_str(&request.body).unwrap();
    let object = parsed.as_object().unwrap();
    assert_eq!(object.len(), 3, "三参：challenge/token/type");
    assert_eq!(object["type"], "url_verification");
    assert_eq!(object["token"], GOLDEN_EVENT_TOKEN);
    let challenge = object["challenge"].as_str().unwrap();
    assert_eq!(challenge.len(), 32, "challenge 为 32 位 hex 随机串");
}

#[test]
fn encrypted_handshake_envelope_is_decryptable_and_signed() {
    let (addr, rx) = start_single_server(echo_challenge, Duration::ZERO);
    let config = feishu_config(format!("http://{addr}/hook"));

    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("AES 加密信封"), "{outcome:?}");

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    // 三签名头齐备
    for name in [
        "X-Lark-Request-Timestamp",
        "X-Lark-Request-Nonce",
        "X-Lark-Signature",
    ] {
        assert!(request.header(name).is_some(), "缺少 {name}");
    }
    // 签名 = sha256(timestamp + nonce + encrypt_key + 原始 body 字节)（独立复算）
    let expected_signature = sha256_hex(&[
        request
            .header("X-Lark-Request-Timestamp")
            .unwrap()
            .as_bytes(),
        request.header("X-Lark-Request-Nonce").unwrap().as_bytes(),
        GOLDEN_ENCRYPT_KEY.as_bytes(),
        request.body.as_bytes(),
    ]);
    assert_eq!(request.header("X-Lark-Signature"), Some(expected_signature));
    // 信封只有 encrypt 字段，解密回三参明文且 challenge 与回显同值
    let parsed: serde_json::Value = serde_json::from_str(&request.body).unwrap();
    assert_eq!(parsed.as_object().unwrap().len(), 1);
    let plaintext = decrypt_request_encrypt(&request.body);
    let inner: serde_json::Value = serde_json::from_slice(&plaintext).unwrap();
    assert_eq!(inner["type"], "url_verification");
    assert_eq!(inner["token"], GOLDEN_EVENT_TOKEN);
    // 服务端 echo 的 challenge 即密文内 challenge（echo_challenge 直接取请求体，
    // 此处核对解密明文中的 challenge 与响应回显同源）
    let echo_response = echo_challenge(&request).1;
    let echoed: serde_json::Value = serde_json::from_str(&echo_response).unwrap();
    assert_eq!(inner["challenge"], echoed["challenge"]);
}

#[test]
fn handshake_fails_when_challenge_not_echoed_verbatim() {
    // 官方要求原样返回 challenge 值
    let wrong = |request: &RecordedPost| {
        let parsed: serde_json::Value = serde_json::from_str(&request.body).unwrap();
        (
            "HTTP/1.1 200 OK".to_string(),
            format!(
                "{{\"challenge\":\"{}-tampered\"}}",
                parsed["challenge"].as_str().unwrap()
            ),
        )
    };
    let (addr, _rx) = start_single_server(wrong, Duration::ZERO);
    let config = feishu_plain_config(format!("http://{addr}/hook"));

    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("不一致"), "{outcome:?}");
}

#[test]
fn handshake_rejects_non_string_challenge_echo() {
    // 官方应答样本 challenge 为字符串：数字回显不通过
    let numeric = |request: &RecordedPost| {
        let parsed: serde_json::Value = serde_json::from_str(&request.body).unwrap();
        (
            "HTTP/1.1 200 OK".to_string(),
            format!(
                "{{\"challenge\":{}}}",
                parsed["challenge"].as_str().unwrap().len()
            ),
        )
    };
    let (addr, _rx) = start_single_server(numeric, Duration::ZERO);
    let config = feishu_plain_config(format!("http://{addr}/hook"));

    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("字符串类型"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_non_200() {
    let responder: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
    let (addr, _rx) = start_single_server(responder, Duration::ZERO);
    let config = feishu_plain_config(format!("http://{addr}/hook"));

    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("500"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_timeout() {
    // 现行 challenge 应答口径 1 秒内；客户端 200ms 超时 vs 服务器 1s 延迟
    let (addr, _rx) = start_single_server(echo_challenge, Duration::from_secs(1));
    let config = feishu_plain_config(format!("http://{addr}/hook"));

    let outcome = Adapter.verify_handshake(&quick_client(Duration::from_millis(200)), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("超时"), "{outcome:?}");
}

// ---- 事件直发全链路 ----

/// 前端确定性拼装的明文（§5.4 官方样本逐字紧凑单行，见 tests::GOLDEN_EVENT_PLAINTEXT）。
use super::GOLDEN_EVENT_PLAINTEXT as SAMPLE_PLAINTEXT;

#[test]
fn plain_dispatch_posts_plaintext_verbatim_without_signature_headers() {
    let ok: fn(&RecordedPost) -> (String, String) = |_| ("HTTP/1.1 200 OK".into(), String::new());
    let (addr, rx) = start_single_server(ok, Duration::ZERO);
    let config = feishu_plain_config(format!("http://{addr}/hook"));

    let outcome = Adapter.dispatch_event(&client(), &config, SAMPLE_PLAINTEXT);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.body, "");
    assert_eq!(outcome.error, None);
    // 明文模式无签名要素可快照（官方 §4.1：默认低安全形态无签名头）
    assert_eq!(outcome.signature, "");
    assert_eq!(outcome.timestamp, None);
    assert_eq!(outcome.msg_id, "");

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(
        request.header("Content-Type").as_deref(),
        Some("application/json")
    );
    assert!(request.header("X-Lark-Signature").is_none());
    // 明文逐字节直发（ADR-0001）
    assert_eq!(request.body, SAMPLE_PLAINTEXT);
    assert_eq!(outcome.request_body.as_deref(), Some(SAMPLE_PLAINTEXT));
}

#[test]
fn encrypted_dispatch_envelope_is_independently_decryptable_and_signed() {
    let ok: fn(&RecordedPost) -> (String, String) = |_| ("HTTP/1.1 200 OK".into(), String::new());
    let (addr, rx) = start_single_server(ok, Duration::ZERO);
    let config = feishu_config(format!("http://{addr}/hook"));

    let outcome = Adapter.dispatch_event(&client(), &config, SAMPLE_PLAINTEXT);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.error, None);

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(
        request.header("Content-Type").as_deref(),
        Some("application/json")
    );
    for name in [
        "X-Lark-Request-Timestamp",
        "X-Lark-Request-Nonce",
        "X-Lark-Signature",
    ] {
        assert!(request.header(name).is_some(), "缺少 {name}");
    }
    // 签名头可由原始 body 字节独立复算，且与快照一致
    let expected_signature = sha256_hex(&[
        request
            .header("X-Lark-Request-Timestamp")
            .unwrap()
            .as_bytes(),
        request.header("X-Lark-Request-Nonce").unwrap().as_bytes(),
        GOLDEN_ENCRYPT_KEY.as_bytes(),
        request.body.as_bytes(),
    ]);
    assert_eq!(
        request.header("X-Lark-Signature"),
        Some(expected_signature.clone())
    );
    assert_eq!(outcome.signature, expected_signature);
    // 时间戳/nonce 头与快照一致（msg_id 快照即 nonce）
    assert_eq!(
        Some(outcome.timestamp.as_deref().unwrap()),
        request.header("X-Lark-Request-Timestamp").as_deref()
    );
    assert_eq!(
        outcome.msg_id,
        request.header("X-Lark-Request-Nonce").unwrap()
    );
    // 信封单字段、可独立解回原明文（黄金向量已验证解密原语）
    let parsed: serde_json::Value = serde_json::from_str(&request.body).unwrap();
    assert_eq!(parsed.as_object().unwrap().len(), 1);
    assert_eq!(
        decrypt_request_encrypt(&request.body),
        SAMPLE_PLAINTEXT.as_bytes()
    );
    // 请求快照为加密信封而非明文
    assert_eq!(outcome.request_body.as_deref(), Some(request.body.as_str()));
}

#[test]
fn dispatch_reports_non_200_status_and_body() {
    let boom: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
    let (addr, _rx) = start_single_server(boom, Duration::ZERO);
    let config = feishu_config(format!("http://{addr}/hook"));

    let outcome = Adapter.dispatch_event(&client(), &config, "{}");

    assert_eq!(outcome.status, 500);
    assert_eq!(outcome.body, "boom");
    assert_eq!(outcome.error, None, "非 200 是回执事实，不是发送错误");
}

#[test]
fn dispatch_reports_timeout_without_response() {
    let slow: fn(&RecordedPost) -> (String, String) = |_| ("HTTP/1.1 200 OK".into(), String::new());
    let (addr, _rx) = start_single_server(slow, Duration::from_secs(1));
    let config = feishu_plain_config(format!("http://{addr}/hook"));

    let outcome = Adapter.dispatch_event(&quick_client(Duration::from_millis(200)), &config, "{}");

    assert_eq!(outcome.status, 0, "未收到响应时 status 为 0");
    let error = outcome.error.clone().expect("应有错误原因");
    assert!(error.contains("超时"), "{outcome:?}");
    assert_eq!(outcome.body, "");
}
