//! 握手与直发全链路（本地 TcpListener）：check_url 加密握手（成功/回包明文非
//! success/验签不过/非加密回包/非 200/超时）、密文直发（URL 三参可复算 + 信封
//! 可独立解密 + 回执快照）、机器人明文通道探测与直发（timestamp/sign 头）、
//! 配置判别。

use std::time::Duration;

use crate::connections::util::sha1_sorted_hex;
use crate::connections::wecom::random_16;
use crate::test_support::{
    ExpectedSnapshots, assert_dispatch_error, assert_dispatch_receipt, assert_snapshots,
    query_params, run_dispatch_case, run_handshake_case, status_responder, RecordedPost,
};

use super::*;

// ---- check_url 加密握手全链路 ----

#[test]
fn handshake_posts_signed_envelope_and_accepts_encrypted_success_reply() {
    let (_outcome, request) = run_handshake_case(
        reply_success_envelope,
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| dingtalk_config(format!("http://{addr}/callback")),
        verify_handshake,
        true,
        &["握手成功"],
    );

    // 请求侧逐项核对官方协议要素（事实库 §4.1/§5.10）
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
    // 信封可独立解密回 check_url 握手明文（包尾 $key = 企微实现字段名 receiveid）
    let decrypted = crypto::decrypt_msg(GOLDEN_ENCODING_AES_KEY, encrypt).unwrap();
    assert_eq!(decrypted.msg, HANDSHAKE_PLAINTEXT.as_bytes());
    assert_eq!(decrypted.receiveid, GOLDEN_OWNER_KEY);
}

#[test]
fn handshake_fails_when_reply_plaintext_is_not_success() {
    // 目标回了可验签解密的加密包，但明文不是 success
    let wrong_plaintext = |_request: &RecordedPost| {
        let encrypt = crypto::encrypt_msg(
            GOLDEN_ENCODING_AES_KEY,
            &random_16(),
            b"ok",
            GOLDEN_OWNER_KEY,
        )
        .unwrap();
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
    run_handshake_case(
        wrong_plaintext,
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| dingtalk_config(format!("http://{addr}/callback")),
        verify_handshake,
        false,
        &["不为 success"],
    );
}

#[test]
fn handshake_fails_when_reply_signature_is_invalid() {
    // 目标回包签名被篡改：回包验签必须拒绝（防伪造/配置错）
    let tampered = |request: &RecordedPost| {
        let (status, body) = reply_success_envelope(request);
        let tampered_body = body.replace("timeStamp", "timestamp");
        (status, tampered_body)
    };
    run_handshake_case(
        tampered,
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| dingtalk_config(format!("http://{addr}/callback")),
        verify_handshake,
        false,
        &["加密 success 回包"],
    );
}

#[test]
fn handshake_fails_on_plain_text_reply() {
    // 目标直接回明文 success（不带引号）：钉钉要求的是加密回包，不算通过
    run_handshake_case(
        status_responder("HTTP/1.1 200 OK", "success"),
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| dingtalk_config(format!("http://{addr}/callback")),
        verify_handshake,
        false,
        &["未回可验签解密的加密"],
    );
}

#[test]
fn handshake_fails_on_non_200() {
    run_handshake_case(
        status_responder("HTTP/1.1 500 Internal Server Error", "boom"),
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| dingtalk_config(format!("http://{addr}/callback")),
        verify_handshake,
        false,
        &["500"],
    );
}

#[test]
fn handshake_fails_on_timeout() {
    // 官方窗口 1500ms；客户端 200ms 超时 vs 服务器 1s 延迟
    run_handshake_case(
        reply_success_envelope,
        Duration::from_secs(1),
        Duration::from_millis(200),
        |addr| dingtalk_config(format!("http://{addr}/callback")),
        verify_handshake,
        false,
        &["超时"],
    );
}

// ---- 密文事件直发全链路 ----

#[test]
fn dispatch_posts_signed_envelope_and_snapshots_protocol_elements() {
    let (outcome, request) = run_dispatch_case(
        reply_success_envelope,
        GOLDEN_EVENT_PLAINTEXT,
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| dingtalk_config(format!("http://{addr}/callback")),
        dispatch_event,
    );

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.error, None);
    // 回执快照：加密回包解密明文 = success
    assert_eq!(outcome.reply.as_deref(), Some("success"));

    // URL 三参与签名快照一致且可复算
    let params = query_params(&request.request_line);
    assert_snapshots(
        &outcome,
        ExpectedSnapshots {
            msg_id: params.get("nonce").map(String::as_str).expect("URL 应带 nonce"),
            signature: params
                .get("signature")
                .map(String::as_str)
                .expect("URL 应带 signature"),
            timestamp: params.get("timestamp").map(String::as_str),
        },
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
    let (outcome, _request) = run_dispatch_case(
        status_responder("HTTP/1.1 200 OK", "ok"),
        "{}",
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| dingtalk_config(format!("http://{addr}/callback")),
        dispatch_event,
    );

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.body, "ok");
    assert_eq!(outcome.reply, None);
}

#[test]
fn dispatch_reports_non_200_status() {
    let (outcome, _request) = run_dispatch_case(
        status_responder("HTTP/1.1 500 Internal Server Error", "boom"),
        "{}",
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| dingtalk_config(format!("http://{addr}/callback")),
        dispatch_event,
    );

    assert_dispatch_receipt(&outcome, 500, "boom");
}

#[test]
fn dispatch_reports_timeout_without_response() {
    let (outcome, _request) = run_dispatch_case(
        status_responder("HTTP/1.1 200 OK", ""),
        "{}",
        Duration::from_secs(1),
        Duration::from_millis(200),
        |addr| dingtalk_config(format!("http://{addr}/callback")),
        dispatch_event,
    );

    assert_dispatch_error(&outcome, &["超时"]);
}

// ---- 机器人明文通道（timestamp/sign = HmacSHA256 头） ----

#[test]
fn bot_handshake_posts_signed_plaintext_probe_and_accepts_2xx() {
    let (_outcome, request) = run_handshake_case(
        status_responder("HTTP/1.1 200 OK", ""),
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| bot_config(format!("http://{addr}/bot")),
        verify_handshake,
        true,
        &[],
    );

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
    run_handshake_case(
        status_responder("HTTP/1.1 403 Forbidden", ""),
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| bot_config(format!("http://{addr}/bot")),
        verify_handshake,
        false,
        &["403"],
    );
}

#[test]
fn bot_dispatch_posts_plaintext_verbatim_with_fresh_sign_headers() {
    let plaintext = r#"{"msgId":"msgrK2ckHkMbaiUWt5xQU+riw==","msgtype":"text"}"#;
    let (outcome, request) = run_dispatch_case(
        status_responder("HTTP/1.1 200 OK", ""),
        plaintext,
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| bot_config(format!("http://{addr}/bot")),
        dispatch_event,
    );

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.error, None);
    // 明文逐字节直发；签名/时间戳快照与实际头一致（幂等键 msgId 在载荷内）
    assert_eq!(outcome.request_body.as_deref(), Some(plaintext));

    assert_eq!(request.body, plaintext);
    let timestamp = request.header("timestamp").unwrap();
    let sign = request.header("sign").unwrap();
    assert_snapshots(
        &outcome,
        ExpectedSnapshots {
            msg_id: "",
            signature: &sign,
            timestamp: Some(&timestamp),
        },
    );
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
