//! 握手与直发全链路（本地 TcpListener）：op13 握手（官方头集合 + 回包验签
//! 成功/回显不符/验签不过/非 2xx/超时）、事件直发（签名三头可复算 + 快照）、
//! op13 模板直发（回包验签落 reply）。
//! 协议原语经本渠道 Adapter 直调（收窄签名，配置判别由注册表路由保证）。

use std::time::Duration;

use crate::connections::ChannelAdapter;
use crate::test_support::{quick_client, start_single_server, RecordedPost};

use super::*;

// ---- op13 验证回调握手 ----

#[test]
fn handshake_posts_official_headers_and_accepts_signed_reply() {
    let (addr, rx) = start_single_server(reply_validation, Duration::ZERO);
    let config = qq_config(format!("http://{addr}/webhooks/qq"));

    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("握手成功"), "{outcome:?}");

    // 请求侧逐项核对官方协议要素（事实库 §3.2）
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(
        request.header("User-Agent").as_deref(),
        Some("QQBot-Callback"),
        "官方 UA 逐字"
    );
    assert_eq!(
        request.header("X-Bot-Appid").as_deref(),
        Some(GOLDEN_APP_ID)
    );
    let parsed: serde_json::Value = serde_json::from_str(&request.body).unwrap();
    assert_eq!(parsed["op"], 13);
    assert_eq!(parsed["d"]["plain_token"].as_str().unwrap().len(), 20);
    // event_ts 为当前秒级字符串（官方样本形态 10 位）
    let event_ts = parsed["d"]["event_ts"].as_str().unwrap();
    assert_eq!(event_ts.len(), 10, "event_ts 为秒级字符串：{event_ts}");
    // 回包签名对请求要素可独立验签
    assert!(
        verify_validation_reply(
            GOLDEN_APP_SECRET,
            parsed["d"]["plain_token"].as_str().unwrap(),
            event_ts,
            reply_validation(&request).1.as_str(),
        )
        .is_ok(),
        "目标侧回包须可通过验签"
    );
}

#[test]
fn handshake_fails_when_reply_signature_is_invalid() {
    // 目标回包签名被篡改（末字节高 3 位置 1，官方形态检查即拒；确定性）
    let forged = |request: &RecordedPost| {
        let (status, body) = reply_validation(request);
        let parsed: serde_json::Value = serde_json::from_str(&body).unwrap();
        let signature = parsed["signature"].as_str().unwrap();
        let forged_signature = format!("{}ff", &signature[..126]);
        let forged_body = serde_json::json!({
            "plain_token": parsed["plain_token"],
            "signature": forged_signature,
        })
        .to_string();
        (status, forged_body)
    };
    let (addr, _rx) = start_single_server(forged, Duration::ZERO);
    let config = qq_config(format!("http://{addr}/webhooks/qq"));

    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("签名"), "{outcome:?}");
}

#[test]
fn handshake_fails_when_plain_token_is_not_echoed() {
    // 目标回包 plain_token 与请求不同值（同长度改首字符，签名仍对原值计算）
    let wrong_echo = |request: &RecordedPost| {
        let (status, body) = reply_validation(request);
        let parsed: serde_json::Value = serde_json::from_str(&body).unwrap();
        let token = parsed["plain_token"].as_str().unwrap();
        let wrong_token = format!("X{}", &token[1..]);
        (status, body.replace(token, &wrong_token))
    };
    let (addr, _rx) = start_single_server(wrong_echo, Duration::ZERO);
    let config = qq_config(format!("http://{addr}/webhooks/qq"));

    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("不一致"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_non_json_or_missing_signature() {
    let plain: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 200 OK".into(), "ok".into());
    let (addr, _rx) = start_single_server(plain, Duration::ZERO);
    let config = qq_config(format!("http://{addr}/webhooks/qq"));

    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("不是合法 JSON"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_non_200() {
    let boom: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
    let (addr, _rx) = start_single_server(boom, Duration::ZERO);
    let config = qq_config(format!("http://{addr}/webhooks/qq"));

    let outcome = Adapter.verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("500"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_timeout() {
    // 官方未给应答时限口径；客户端 200ms 超时 vs 服务器 1s 延迟
    let (addr, _rx) = start_single_server(reply_validation, Duration::from_secs(1));
    let config = qq_config(format!("http://{addr}/webhooks/qq"));

    let outcome = Adapter.verify_handshake(&quick_client(Duration::from_millis(200)), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("超时"), "{outcome:?}");
}

// ---- 普通事件直发（X-Signature-Ed25519 签名三头） ----

#[test]
fn dispatch_signs_event_and_snapshots_protocol_elements() {
    let ok: fn(&RecordedPost) -> (String, String) = |_| {
        (
            "HTTP/1.1 200 OK".into(),
            String::new(),
        )
    };
    let (addr, rx) = start_single_server(ok, Duration::ZERO);
    let config = qq_config(format!("http://{addr}/webhooks/qq"));

    let outcome = Adapter.dispatch_event(&client(), &config, GOLDEN_EVENT_PLAINTEXT);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.error, None);
    assert_eq!(outcome.reply, None, "普通事件无解密回包");
    assert_eq!(outcome.request_body.as_deref(), Some(GOLDEN_EVENT_PLAINTEXT));

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(request.body, GOLDEN_EVENT_PLAINTEXT, "body 逐字节透传");
    let signature = request
        .header("X-Signature-Ed25519")
        .expect("应带 X-Signature-Ed25519 头");
    let timestamp = request
        .header("X-Signature-Timestamp")
        .expect("应带 X-Signature-Timestamp 头");
    assert_eq!(request.header("X-Bot-Appid").as_deref(), Some(GOLDEN_APP_ID));
    assert_eq!(timestamp.len(), 10, "timestamp 为秒级字符串：{timestamp}");
    // 签名快照与实际头一致且对（timestamp + body）可复算
    assert_eq!(outcome.signature, signature);
    assert_eq!(outcome.timestamp.as_deref(), Some(timestamp.as_str()));
    assert!(sign::verify_event(
        GOLDEN_APP_SECRET,
        &timestamp,
        GOLDEN_EVENT_PLAINTEXT.as_bytes(),
        &signature
    )
    .is_ok());
    // 普通事件官方请求无唯一标识头，msg_id 不落值
    assert_eq!(outcome.msg_id, "");
}

#[test]
fn dispatch_reports_non_200_status() {
    let boom: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
    let (addr, _rx) = start_single_server(boom, Duration::ZERO);
    let config = qq_config(format!("http://{addr}/webhooks/qq"));

    let outcome = Adapter.dispatch_event(&client(), &config, "{}");

    assert_eq!(outcome.status, 500);
    assert_eq!(outcome.body, "boom");
    assert_eq!(outcome.error, None, "非 200 是回执事实，不是发送错误");
}

#[test]
fn dispatch_reports_timeout_without_response() {
    let slow: fn(&RecordedPost) -> (String, String) = |_| ("HTTP/1.1 200 OK".into(), String::new());
    let (addr, _rx) = start_single_server(slow, Duration::from_secs(1));
    let config = qq_config(format!("http://{addr}/webhooks/qq"));

    let outcome = Adapter.dispatch_event(&quick_client(Duration::from_millis(200)), &config, "{}");

    assert_eq!(outcome.status, 0, "未收到响应时 status 为 0");
    let error = outcome.error.clone().expect("应有错误原因");
    assert!(error.contains("超时"), "{outcome:?}");
}

// ---- op13 验证回调模板直发 ----

#[test]
fn dispatch_op13_template_verifies_reply_into_receipt() {
    let (addr, rx) = start_single_server(reply_validation, Duration::ZERO);
    let config = qq_config(format!("http://{addr}/webhooks/qq"));
    let plaintext = build_validation_body(GOLDEN_PLAIN_TOKEN, GOLDEN_EVENT_TS);

    let outcome = Adapter.dispatch_event(&client(), &config, &plaintext);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.error, None);
    // plain_token 回显 + Ed25519 验签通过：回显值落 reply 供期望比对
    assert_eq!(outcome.reply.as_deref(), Some(GOLDEN_PLAIN_TOKEN));
    assert_eq!(outcome.msg_id, GOLDEN_PLAIN_TOKEN, "plain_token 即唯一标识快照");

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    // op13 验证回调按官方形态发：UA + X-Bot-Appid，无签名三头
    assert_eq!(
        request.header("User-Agent").as_deref(),
        Some("QQBot-Callback")
    );
    assert_eq!(request.header("X-Bot-Appid").as_deref(), Some(GOLDEN_APP_ID));
    assert!(request.header("X-Signature-Ed25519").is_none());
    assert_eq!(request.body, plaintext);
}

#[test]
fn dispatch_op13_template_records_unverifiable_reply_as_none() {
    // 目标回签名错误的回包：reply 置 None，由期望回执比对给出结论
    let forged = |request: &RecordedPost| {
        let (status, body) = reply_validation(request);
        let parsed: serde_json::Value = serde_json::from_str(&body).unwrap();
        let signature = parsed["signature"].as_str().unwrap();
        let forged_body = serde_json::json!({
            "plain_token": parsed["plain_token"],
            "signature": format!("{}ff", &signature[..126]),
        })
        .to_string();
        (status, forged_body)
    };
    let (addr, _rx) = start_single_server(forged, Duration::ZERO);
    let config = qq_config(format!("http://{addr}/webhooks/qq"));
    let plaintext = build_validation_body(GOLDEN_PLAIN_TOKEN, GOLDEN_EVENT_TS);

    let outcome = Adapter.dispatch_event(&client(), &config, &plaintext);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.reply, None, "验签不过时不落回显值");
}
