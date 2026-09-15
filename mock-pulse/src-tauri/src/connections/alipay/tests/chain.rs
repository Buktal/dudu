//! 探针握手与直发全链路（本地 TcpListener）：推送探针握手（sign 可由表单
//! 解码值按 rsaCheckV1 复算验签 + 200/非 2xx）、表单直发（业务字节逐段保留 +
//! 旧 sign 剔除现算 + sign_type 补齐 + 幂等键/notify_time 快照 + 签名 base64
//! 的线上编码）、超时回执、私钥坏文本拒绝、配置判别。

use std::time::Duration;

use rsa::RsaPublicKey;

use crate::connections::ConnectionConfig;
use crate::test_support::{quick_client, start_single_server};

use super::*;

/// 接收侧按官方验签规则复算（§4.3 rsaCheckV1）：表单解码 kv（sign/sign_type
/// 除外）字典序拼串 → 支付宝公钥验签 sign——与适配器签名互为对偶（即商户
/// 侧实现）。
fn receiver_verify(body: &str, public_key: &RsaPublicKey) -> bool {
    let pairs = form_pairs(body);
    let sign_b64 = pairs
        .iter()
        .find(|(key, _)| key == "sign")
        .map(|(_, value)| value.clone())
        .unwrap_or_default();
    !sign_b64.is_empty() && ali_verify(&signing_concat(&pairs), public_key, &sign_b64)
}

fn body_param<'a>(body: &'a str, name: &str) -> Option<&'a str> {
    body.split('&').find_map(|pair| {
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        (key == name).then_some(value)
    })
}

// ---- 推送探针握手全链路（网关验证握手细节待核验(09-27)，探针语义同普通推送） ----

#[test]
fn handshake_posts_probe_form_and_accepts_200() {
    let key_pem = test_private_key_pem();
    let public_key = parse_private_key(&key_pem).unwrap().to_public_key().clone();
    let public_for_closure = public_key.clone();
    let (addr, rx) = start_single_server(
        move |request| {
            // 接收侧按官方验签规则复算（§4.3）：解码 kv（sign/sign_type 除外）
            // 字典序拼串、支付宝公钥验签
            assert!(
                receiver_verify(&request.body, &public_for_closure),
                "探针 sign 应可通过 rsaCheckV1 验签"
            );
            // 探针即官方支付异步通知核验样本（§5.1 字段值逐字）
            assert!(request.body.contains("notify_type=trade_status_sync"));
            assert!(request
                .body
                .contains("notify_id=ac05099524730693a8b330c45cf72da943"));
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let url = format!("http://{addr}/webhooks/alipay");
    let config = alipay_config(url, &key_pem);
    let outcome = verify_handshake(&client(), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("推送探针"), "{outcome:?}");
    assert!(outcome.message.contains("200"), "{outcome:?}");
    assert!(outcome.message.contains("RSA-SHA256"), "{outcome:?}");

    // 请求侧逐项核对官方协议要素（§2.1 表单 POST + Content-Type）
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(
        request.header("content-type").as_deref(),
        Some("application/x-www-form-urlencoded")
    );
    let sign = body_param(&request.body, "sign").unwrap();
    assert!(receiver_verify(&request.body, &public_key));
    assert!(sign.contains('%'), "base64 的 + / = 段按线上编码形态传输");
}

#[test]
fn handshake_fails_on_non_200() {
    let key_pem = test_private_key_pem();
    let boom = |_request: &crate::test_support::RecordedPost| {
        (
            "HTTP/1.1 500 Internal Server Error".into(),
            "boom".to_string(),
        )
    };
    let (addr, _rx) = start_single_server(boom, Duration::ZERO);
    let config = alipay_config(format!("http://{addr}/webhooks/alipay"), &key_pem);
    let outcome = verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("500"), "{outcome:?}");
    assert!(outcome.message.contains("推送探针"), "{outcome:?}");
    assert!(outcome.message.contains("待核验"), "{outcome:?}");
}

#[test]
fn handshake_rejects_unparseable_private_key() {
    // 私钥坏文本：签名源不可用即拒绝（不发请求）
    let config = alipay_config(
        "http://127.0.0.1:1/webhooks/alipay".into(),
        "not-a-key-at-all",
    );
    let outcome = verify_handshake(&client(), &config);
    assert!(!outcome.ok);
    assert!(outcome.message.contains("私钥"), "{outcome:?}");
}

// ---- 表单直发全链路 ----

#[test]
fn dispatch_posts_form_with_fresh_sign_and_snapshots() {
    let key_pem = test_private_key_pem();
    let public_key = parse_private_key(&key_pem).unwrap().to_public_key().clone();
    let (addr, rx) = start_single_server(
        move |request| {
            let sign = body_param(&request.body, "sign").expect("应带 sign 参数");
            assert!(!sign.is_empty());
            // 业务明文段在前、旧 sign 不透传、sign_type 保留在表单
            assert!(request.body.starts_with("notify_time=2018-10-21%2015%3A45%3A22"));
            assert!(!request.body.contains("601510b7970e52cc63db0f44997cf70e"));
            assert!(request.body.contains("sign_type=RSA2"));
            assert!(request.body.contains("trade_status=TRADE_SUCCESS"));
            assert!(request.body.contains("total_amount=10.99"));
            assert!(receiver_verify(&request.body, &public_key));
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let config = alipay_config(format!("http://{addr}/webhooks/alipay"), &key_pem);

    let outcome = dispatch_event(&client(), &config, GOLDEN_NOTIFY_BODY);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.error, None);
    assert_eq!(outcome.reply, None);
    // 幂等键快照：notify_id 首选（§3.4）；notify_time 快照落官方形态
    assert_eq!(outcome.msg_id, GOLDEN_NOTIFY_ID);
    assert_eq!(
        outcome.timestamp.clone().expect("应带 notify_time 快照"),
        GOLDEN_NOTIFY_TIME
    );
    // 签名快照即 sign（2048 位 RSA2 的标准 base64，344 字符）
    assert_eq!(outcome.signature.len(), 344);
    // 请求快照 = 业务字节 + 尾部追加 sign（form 编码形态）
    let request_body = outcome.request_body.clone().expect("应带请求快照");
    assert!(request_body.starts_with("notify_time=2018-10-21%2015%3A45%3A22"));
    assert!(request_body.ends_with(&format!("&sign={}", form_encode_value(&outcome.signature))));

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    // 接收侧复算：解码 kv（sign/sign_type 除外）字典序拼串 + 公钥验签
    assert!(receiver_verify(&request.body, &parse_private_key(&key_pem).unwrap().to_public_key()));
}

#[test]
fn dispatch_appends_sign_type_when_plaintext_missing() {
    // 明文缺 sign_type：适配器补 RSA2（新建应用必须 §4.1），签名吃其余字段
    let key_pem = test_private_key_pem();
    let public_key = parse_private_key(&key_pem).unwrap().to_public_key().clone();
    let body = "app_id=2019082200007148&out_trade_no=6823789339978248&trade_status=TRADE_SUCCESS";
    let (addr, rx) = start_single_server(
        move |request| {
            assert!(request.body.contains("&sign_type=RSA2"));
            assert!(request.body.starts_with(body));
            assert!(receiver_verify(&request.body, &public_key));
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let config = alipay_config(format!("http://{addr}/webhooks/alipay"), &key_pem);

    let outcome = dispatch_event(&client(), &config, body);

    assert_eq!(outcome.status, 200, "{outcome:?}");
    // 幂等键回退：无 notify_id 时取 trade_no/out_trade_no
    assert_eq!(outcome.msg_id, "6823789339978248");
    // 无 notify_time 信封则不落时间快照
    assert_eq!(outcome.timestamp.as_deref(), Some(""));
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert!(receiver_verify(&request.body, &parse_private_key(&key_pem).unwrap().to_public_key()));
}

#[test]
fn dispatch_reports_non_200_status_and_body() {
    let key_pem = test_private_key_pem();
    let boom = |_request: &crate::test_support::RecordedPost| {
        (
            "HTTP/1.1 500 Internal Server Error".into(),
            "boom".to_string(),
        )
    };
    let (addr, _rx) = start_single_server(boom, Duration::ZERO);
    let config = alipay_config(format!("http://{addr}/webhooks/alipay"), &key_pem);

    let outcome = dispatch_event(&client(), &config, GOLDEN_NOTIFY_BODY);

    assert_eq!(outcome.status, 500);
    assert_eq!(outcome.body, "boom");
    assert_eq!(outcome.error, None, "非 200 是回执事实，不是发送错误");
}

#[test]
fn dispatch_reports_timeout_with_official_retry_note() {
    // 官方口径实锤（§3.3）：fail/非 200 按 25h 8 次重推（支付 4m 首重）——
    // 超时文案附该口径；客户端 200ms 超时 vs 服务器 1s 延迟
    let key_pem = test_private_key_pem();
    let slow =
        |_request: &crate::test_support::RecordedPost| ("HTTP/1.1 200 OK".to_string(), String::new());
    let (addr, _rx) = start_single_server(slow, Duration::from_secs(1));
    let config = alipay_config(format!("http://{addr}/webhooks/alipay"), &key_pem);

    let outcome = dispatch_event(&quick_client(Duration::from_millis(200)), &config, "charset=utf-8");

    assert_eq!(outcome.status, 0, "未收到响应时 status 为 0");
    let error = outcome.error.clone().expect("应有错误原因");
    assert!(error.contains("超时"), "{outcome:?}");
    assert!(error.contains("25h 8 次"), "{outcome:?}");
    assert_eq!(outcome.body, "");
}

#[test]
fn dispatch_rejects_unparseable_private_key_without_request() {
    let config = alipay_config("http://127.0.0.1:1/webhooks/alipay".into(), "不是密钥");
    let outcome = dispatch_event(&client(), &config, GOLDEN_NOTIFY_BODY);
    assert_eq!(outcome.status, 0);
    assert!(outcome.error.unwrap().contains("私钥"));
}

// ---- 配置判别 ----

#[test]
fn dispatch_and_handshake_reject_non_alipay_config() {
    let config = ConnectionConfig::Jingdong {
        url: "http://127.0.0.1:1/hook".into(),
        app_key: "yourappkey".into(),
        app_secret: "yourappSecret".into(),
    };

    let outcome = dispatch_event(&client(), &config, "a=1");
    assert_eq!(outcome.status, 0);
    assert!(outcome.error.unwrap().contains("不是支付宝渠道"));

    let handshake = verify_handshake(&client(), &config);
    assert!(!handshake.ok);
    assert!(handshake.message.contains("不是支付宝渠道"));
}
