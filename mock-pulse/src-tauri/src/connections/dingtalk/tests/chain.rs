//! 握手与直发全链路（本地 TcpListener）：check_url 加密握手（成功/回包明文非
//! success/验签不过/非加密回包/非 200/超时）、密文直发（URL 三参可复算 + 信封
//! 可独立解密 + 回执快照）、机器人明文通道探测与直发（timestamp/sign 头）、
//! 配置判别。

use std::time::Duration;

use crate::connections::util::sha1_sorted_hex;
use crate::test_support::{quick_client, start_single_server, RecordedPost};

use super::*;

// ---- check_url 加密握手全链路 ----

#[test]
fn handshake_posts_signed_envelope_and_accepts_encrypted_success_reply() {
    let (addr, rx) = start_single_server(reply_success_envelope, Duration::ZERO);
    let config = dingtalk_config(format!("http://{addr}/callback"));

    let outcome = verify_handshake(&client(), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("握手成功"), "{outcome:?}");

    // 请求侧逐项核对官方协议要素（事实库 §4.1/§5.10）
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    // URL 三参：?signature=…&timestamp=…&nonce=…
    assert!(
        request.request_line.contains("POST /callback?"),
        "请求行：{}",
        request.request_line
    );
    let params = query_params(&request.request_line);
    let signature = params.get("signature").expect("URL 应带 signature");
    let timestamp = params.get("timestamp").expect("URL 应带 timestamp");
    let nonce = params.get("nonce").expect("URL 应带 nonce");
    assert_eq!(timestamp.len(), 13, "timestamp 为毫秒：{timestamp}");
    assert_eq!(nonce.len(), 16, "nonce 为 16 位字母数字（官方样本形态）");
    // sha1 四参：对实际信封的 encrypt 可复算
    let parsed: serde_json::Value = serde_json::from_str(&request.body).unwrap();
    let encrypt = parsed["encrypt"].as_str().unwrap();
    assert_eq!(
        parsed.as_object().unwrap().len(),
        1,
        "信封只有 encrypt 字段"
    );
    let expected_signature = sha1_sorted_hex(&[GOLDEN_TOKEN, timestamp, nonce, encrypt]);
    assert_eq!(signature, &expected_signature);
    // 信封可独立解密回 check_url 握手明文
    let decrypted = crypto::decrypt_msg(GOLDEN_ENCODING_AES_KEY, encrypt).unwrap();
    assert_eq!(decrypted.msg, HANDSHAKE_PLAINTEXT.as_bytes());
    assert_eq!(decrypted.owner_key, GOLDEN_OWNER_KEY);
}

/// 请求行中的 query 解析（测试侧专用）：去掉方法/路径前缀与 HTTP 版本后缀，
/// a=1&b=2 → map。
fn query_params(request_line: &str) -> std::collections::HashMap<String, String> {
    let raw = request_line.split('?').nth(1).unwrap_or_default();
    let query = raw.split(" HTTP/").next().unwrap_or_default();
    query
        .split('&')
        .filter_map(|pair| pair.split_once('='))
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect()
}

#[test]
fn handshake_fails_when_reply_plaintext_is_not_success() {
    // 目标回了可验签解密的加密包，但明文不是 success
    let wrong_plaintext = |_request: &RecordedPost| {
        let encrypt =
            crypto::encrypt_event(GOLDEN_ENCODING_AES_KEY, b"ok", GOLDEN_OWNER_KEY).unwrap();
        let timestamp = "1783610513".to_string();
        let nonce = "w2WPvWxxxxGOmIB".to_string();
        let signature = crypto::build_signature(GOLDEN_TOKEN, &timestamp, &nonce, &encrypt);
        (
            "HTTP/1.1 200 OK".into(),
            serde_json::json!({
                "msg_signature": signature,
                "timeStamp": timestamp,
                "nonce": nonce,
                "encrypt": encrypt,
            })
            .to_string(),
        )
    };
    let (addr, _rx) = start_single_server(wrong_plaintext, Duration::ZERO);
    let config = dingtalk_config(format!("http://{addr}/callback"));

    let outcome = verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("不为 success"), "{outcome:?}");
}

#[test]
fn handshake_fails_when_reply_signature_is_invalid() {
    // 目标回包签名被篡改：回包验签必须拒绝（防伪造/配置错）
    let tampered = |request: &RecordedPost| {
        let (status, body) = reply_success_envelope(request);
        let tampered_body = body.replace("timeStamp", "timestamp");
        (status, tampered_body)
    };
    let (addr, _rx) = start_single_server(tampered, Duration::ZERO);
    let config = dingtalk_config(format!("http://{addr}/callback"));

    let outcome = verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("加密 success 回包"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_plain_text_reply() {
    // 目标直接回明文 success（不带引号）：钉钉要求的是加密回包，不算通过
    let plain: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 200 OK".into(), "success".into());
    let (addr, _rx) = start_single_server(plain, Duration::ZERO);
    let config = dingtalk_config(format!("http://{addr}/callback"));

    let outcome = verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(
        outcome.message.contains("未回可验签解密的加密"),
        "{outcome:?}"
    );
}

#[test]
fn handshake_fails_on_non_200() {
    let boom: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
    let (addr, _rx) = start_single_server(boom, Duration::ZERO);
    let config = dingtalk_config(format!("http://{addr}/callback"));

    let outcome = verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("500"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_timeout() {
    // 官方窗口 1500ms；客户端 200ms 超时 vs 服务器 1s 延迟
    let (addr, _rx) = start_single_server(reply_success_envelope, Duration::from_secs(1));
    let config = dingtalk_config(format!("http://{addr}/callback"));

    let outcome = verify_handshake(&quick_client(Duration::from_millis(200)), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("超时"), "{outcome:?}");
}

// ---- 密文事件直发全链路 ----

#[test]
fn dispatch_posts_signed_envelope_and_snapshots_protocol_elements() {
    let (addr, rx) = start_single_server(reply_success_envelope, Duration::ZERO);
    let config = dingtalk_config(format!("http://{addr}/callback"));

    let outcome = dispatch_event(&client(), &config, GOLDEN_EVENT_PLAINTEXT);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.error, None);
    // 回执快照：加密回包解密明文 = success
    assert_eq!(outcome.reply.as_deref(), Some("success"));

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    // URL 三参与签名快照一致且可复算
    let params = query_params(&request.request_line);
    assert_eq!(
        params.get("signature").map(String::as_str),
        Some(outcome.signature.as_str())
    );
    assert_eq!(
        params.get("timestamp").map(String::as_str),
        outcome.timestamp.as_deref()
    );
    assert_eq!(
        params.get("nonce").map(String::as_str),
        Some(outcome.msg_id.as_str())
    );
    // 请求快照 = 实际信封；信封可独立解回原明文（ADR-0001 逐字节）
    assert_eq!(outcome.request_body.as_deref(), Some(request.body.as_str()));
    let parsed: serde_json::Value = serde_json::from_str(&request.body).unwrap();
    let encrypt = parsed["encrypt"].as_str().unwrap();
    let decrypted = crypto::decrypt_msg(GOLDEN_ENCODING_AES_KEY, encrypt).unwrap();
    assert_eq!(decrypted.msg, GOLDEN_EVENT_PLAINTEXT.as_bytes());
}

#[test]
fn dispatch_records_plain_receipt_without_encrypted_reply() {
    // 目标回非加密包（如明文 ok）：状态与正文照录，reply 置 None 由期望比对定性
    let plain: fn(&RecordedPost) -> (String, String) = |_| ("HTTP/1.1 200 OK".into(), "ok".into());
    let (addr, _rx) = start_single_server(plain, Duration::ZERO);
    let config = dingtalk_config(format!("http://{addr}/callback"));

    let outcome = dispatch_event(&client(), &config, "{}");

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.body, "ok");
    assert_eq!(outcome.reply, None);
}

#[test]
fn dispatch_reports_non_200_status() {
    let boom: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
    let (addr, _rx) = start_single_server(boom, Duration::ZERO);
    let config = dingtalk_config(format!("http://{addr}/callback"));

    let outcome = dispatch_event(&client(), &config, "{}");

    assert_eq!(outcome.status, 500);
    assert_eq!(outcome.body, "boom");
    assert_eq!(outcome.error, None, "非 200 是回执事实，不是发送错误");
}

#[test]
fn dispatch_reports_timeout_without_response() {
    let slow: fn(&RecordedPost) -> (String, String) = |_| ("HTTP/1.1 200 OK".into(), String::new());
    let (addr, _rx) = start_single_server(slow, Duration::from_secs(1));
    let config = dingtalk_config(format!("http://{addr}/callback"));

    let outcome = dispatch_event(&quick_client(Duration::from_millis(200)), &config, "{}");

    assert_eq!(outcome.status, 0, "未收到响应时 status 为 0");
    let error = outcome.error.clone().expect("应有错误原因");
    assert!(error.contains("超时"), "{outcome:?}");
}

// ---- 机器人明文通道（timestamp/sign = HmacSHA256 头） ----

#[test]
fn bot_handshake_posts_signed_plaintext_probe_and_accepts_2xx() {
    let ok: fn(&RecordedPost) -> (String, String) = |_| ("HTTP/1.1 200 OK".into(), String::new());
    let (addr, rx) = start_single_server(ok, Duration::ZERO);
    let config = bot_config(format!("http://{addr}/bot"));

    let outcome = verify_handshake(&client(), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    // 官方最小 text 片段探测体（逐字）+ 官方头集合
    assert_eq!(
        request.body,
        r#"{"msgtype":"text","text":{"content":"你好"}}"#
    );
    assert_eq!(
        request.header("Content-Type").as_deref(),
        Some("application/json; charset=utf-8")
    );
    let timestamp = request.header("timestamp").expect("应带 timestamp 头");
    assert_eq!(timestamp.len(), 13, "timestamp 为毫秒：{timestamp}");
    let sign = request.header("sign").expect("应带 sign 头");
    assert_eq!(sign, bot::build_sign(GOLDEN_APP_SECRET, &timestamp));
}

#[test]
fn bot_handshake_fails_on_non_2xx() {
    let boom: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 403 Forbidden".into(), String::new());
    let (addr, _rx) = start_single_server(boom, Duration::ZERO);
    let config = bot_config(format!("http://{addr}/bot"));

    let outcome = verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("403"), "{outcome:?}");
}

#[test]
fn bot_dispatch_posts_plaintext_verbatim_with_fresh_sign_headers() {
    let ok: fn(&RecordedPost) -> (String, String) = |_| ("HTTP/1.1 200 OK".into(), String::new());
    let (addr, rx) = start_single_server(ok, Duration::ZERO);
    let config = bot_config(format!("http://{addr}/bot"));
    let plaintext = r#"{"msgId":"msgrK2ckHkMbaiUWt5xQU+riw==","msgtype":"text"}"#;

    let outcome = dispatch_event(&client(), &config, plaintext);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.error, None);
    // 明文逐字节直发；签名/时间戳快照与实际头一致（幂等键 msgId 在载荷内）
    assert_eq!(outcome.request_body.as_deref(), Some(plaintext));
    assert_eq!(outcome.msg_id, "");

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(request.body, plaintext);
    let timestamp = request.header("timestamp").unwrap();
    let sign = request.header("sign").unwrap();
    assert_eq!(outcome.timestamp.as_deref(), Some(timestamp.as_str()));
    assert_eq!(outcome.signature, sign);
    assert_eq!(sign, bot::build_sign(GOLDEN_APP_SECRET, &timestamp));
    assert_eq!(outcome.reply, None);
}

// ---- 配置判别 ----

#[test]
fn dispatch_and_handshake_reject_non_dingtalk_config() {
    let config = ConnectionConfig::Feishu {
        url: "http://127.0.0.1:1/hook".into(),
        app_id: "cli_x".into(),
        verification_token: "token".into(),
        encrypt_key: String::new(),
    };

    let outcome = dispatch_event(&client(), &config, "{}");
    assert_eq!(outcome.status, 0);
    assert!(outcome.error.unwrap().contains("不是钉钉渠道"));

    let handshake = verify_handshake(&client(), &config);
    assert!(!handshake.ok);
    assert!(handshake.message.contains("不是钉钉渠道"));
}
