//! 服务商（第三方小程序）推送协议（事实库 §2 体系 C / §4.3）：
//! - 信封：{Nonce, TimeStamp, Encrypt, MsgSignature}（官方黄金例键序逐字）
//! - 验签：MsgSignature = sha1(字典序排序(TOKEN, Nonce, TimeStamp, Encrypt))——
//!   官方只说「根据【消息验证 TOKEN】、Nonce、TimeStamp、Encrypt 获取签名」，
//!   精确拼接序在官方示例代码包内，待核验(09-27)；按同族（微信系四值签名）
//!   字典序 sha1 实现，原语与企微共用 util::sha1_sorted_hex
//! - 解密：Encrypt 用【消息加密解密 KEY】调 MsgDecrypt，AES 参数同在示例
//!   代码包内（待核验）——密文按原样透传，KEY 随连接配置保存，不参与签名
//! - 握手：官方无独立 challenge（授权事件 URL 直接推送），按授权推送形态
//!   验证 TOKEN 验签；目标必须直接返回字符串 success（不带引号），否则重试 3 次

use super::super::{
    no_reply, send_measured_outcome, DispatchOutcome, DispatchSnapshot, HandshakeOutcome,
};
use crate::connections::util;

/// 官方黄金信封（§4.3 逐字）中的 Encrypt 字面量（官方示例密文占位）。
const GOLDEN_ENCRYPT: &str = "Encrypt xxxx";

/// MsgSignature：TOKEN/Nonce/TimeStamp/Encrypt 字典序 sha1（同族算法，精确序官方待核验）。
pub(super) fn msg_signature(token: &str, nonce: &str, timestamp: &str, encrypt: &str) -> String {
    util::sha1_sorted_hex(&[token, nonce, timestamp, encrypt])
}

/// 组装推送信封（§4.3 官方键序：Nonce → TimeStamp → Encrypt → MsgSignature）。
fn build_envelope(nonce: &str, timestamp: &str, encrypt: &str, signature: &str) -> String {
    serde_json::json!({
        "Nonce": nonce,
        "TimeStamp": timestamp,
        "Encrypt": encrypt,
        "MsgSignature": signature,
    })
    .to_string()
}

/// 从模板/前端拼装的信封文本取 Encrypt（缺失或非法 JSON 视为载荷错误，不发送）。
fn parse_encrypt(body: &str) -> Result<String, String> {
    let parsed: serde_json::Value = serde_json::from_str(body)
        .map_err(|_| format!("推送信封不是合法 JSON：{body}"))?;
    parsed
        .get("Encrypt")
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .ok_or_else(|| format!("推送信封缺少 Encrypt 字段：{body}"))
}

/// 随机 Nonce：官方黄金例为纯数字（"4464221"）的 7 位形态——rand Uniform
/// 均匀采样（原 uuid 字节算术拼值分布非均匀且位数不定）。
fn random_nonce() -> String {
    use rand::distributions::{Distribution, Uniform};
    Uniform::new_inclusive(1_000_000u32, 9_999_999)
        .sample(&mut rand::thread_rng())
        .to_string()
}

/// 校验目标按官方语义直接返回字符串 success（不带引号；容忍首尾空白）。
fn check_success(response_body: &str) -> Result<(), String> {
    if response_body.trim() == "success" {
        Ok(())
    } else {
        Err(format!(
            "目标未直接返回 success（不带引号）：{response_body}"
        ))
    }
}

/// 服务商推送直发公共体：Encrypt 原样透传，Nonce/TimeStamp 每次推送重生成，
/// MsgSignature 按 TOKEN 重算（模拟平台真实推送）。
/// 私有协议原语：对外只经 [`super::Adapter`]（super::super::ChannelAdapter）路由。
fn post(
    client: &reqwest::blocking::Client,
    url: &str,
    encrypt: &str,
    token: &str,
) -> DispatchOutcome {
    let nonce = random_nonce();
    let timestamp = util::now_secs().to_string();
    let signature = msg_signature(token, &nonce, &timestamp, encrypt);
    let envelope = build_envelope(&nonce, &timestamp, encrypt, &signature);
    let request = client
        .post(url)
        .header("Content-Type", "application/json")
        .body(envelope.clone());
    send_measured_outcome(
        request,
        "",
        DispatchSnapshot {
            // 发送唯一标识快照 = 本次推送的 Nonce
            msg_id: nonce,
            signature,
            timestamp: Some(timestamp),
            request_body: Some(envelope),
        },
        no_reply,
    )
}

/// 按官方形态验证服务商推送：无独立 challenge（授权事件 URL 直接推送），
/// 以授权推送形态 POST 一个 TOKEN 重签信封，期望目标直接回 success。
/// 私有协议原语：对外只经 [`super::Adapter`]（super::super::ChannelAdapter）路由。
pub(super) fn verify_handshake(
    client: &reqwest::blocking::Client,
    url: &str,
    isv_token: &str,
) -> HandshakeOutcome {
    let outcome = post(client, url, GOLDEN_ENCRYPT, isv_token);
    match outcome.error {
        Some(error) => HandshakeOutcome {
            ok: false,
            message: error,
        },
        None if (200..300).contains(&outcome.status) => {
            match check_success(&outcome.body) {
                Ok(()) => HandshakeOutcome {
                    ok: true,
                    message: "服务商授权推送验证成功：TOKEN 验签信封已被接收并回 success（HTTP 200）"
                        .into(),
                },
                Err(reason) => HandshakeOutcome {
                    ok: false,
                    message: format!("HTTP 200 但 {reason}"),
                },
            }
        }
        None => HandshakeOutcome {
            ok: false,
            message: format!("目标返回 HTTP {}，服务商授权推送验证未通过", outcome.status),
        },
    }
}

/// 直发一条服务商推送：取信封 Encrypt 原样透传，重生成 Nonce/TimeStamp 并重算
/// MsgSignature（信封为动态要素，与 dop 明文透传不同，属适配器内的既定例外）。
/// 私有协议原语：对外只经 [`super::Adapter`]（super::super::ChannelAdapter）路由。
pub(super) fn dispatch(
    client: &reqwest::blocking::Client,
    url: &str,
    body: &str,
    token: &str,
) -> DispatchOutcome {
    match parse_encrypt(body) {
        Ok(encrypt) => post(client, url, &encrypt, token),
        Err(reason) => DispatchOutcome::not_sent(reason),
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::test_support::{quick_client, start_single_server, RecordedPost};

    /// 微信系四值签名同族黄金例（企微官方 90968，独立来源；常量唯一出处
    /// 为 wecom::crypto，按测试引用引作同族验签参考向量）
    use crate::connections::wecom::crypto::{
        GOLDEN_ENCRYPT as FAMILY_ENCRYPT, GOLDEN_NONCE as FAMILY_NONCE,
        GOLDEN_TIMESTAMP as FAMILY_TIMESTAMP, GOLDEN_TOKEN as FAMILY_TOKEN,
    };

    #[test]
    fn msg_signature_matches_wechat_family_golden_vector() {
        // 同族参考向量：服务商验签官方精确拼接序待核验(09-27)，按字典序 sha1
        // 实现的正确性以企微官方 90968 黄金例独立收口（同一原语 util::sha1_sorted_hex）
        assert_eq!(
            msg_signature(
                FAMILY_TOKEN,
                FAMILY_NONCE,
                FAMILY_TIMESTAMP,
                FAMILY_ENCRYPT
            ),
            "477715d11cdb4164915debcba66cb864d751f3e6"
        );
    }

    #[test]
    fn build_envelope_matches_official_key_order() {
        // 官方黄金信封 §4.3 键序逐字：Nonce → TimeStamp → Encrypt → MsgSignature
        let envelope = build_envelope("4464221", "1535551395", GOLDEN_ENCRYPT, "ba394c");
        assert_eq!(
            envelope,
            r#"{"Nonce":"4464221","TimeStamp":"1535551395","Encrypt":"Encrypt xxxx","MsgSignature":"ba394c"}"#
        );
    }

    #[test]
    fn parse_encrypt_rejects_malformed_envelope() {
        assert!(parse_encrypt("not json").is_err());
        assert!(parse_encrypt(r#"{"Nonce":"1"}"#).is_err());
        assert_eq!(
            parse_encrypt(r#"{"Nonce":"4464221","TimeStamp":"1535551395","Encrypt":"Encrypt xxxx","MsgSignature":"ba394c"}"#).unwrap(),
            GOLDEN_ENCRYPT
        );
    }

    #[test]
    fn check_success_only_accepts_unquoted_success() {
        assert!(check_success("success").is_ok());
        assert!(check_success("success\r\n").is_ok());
        assert!(check_success(r#""success""#).is_err());
        assert!(check_success("ok").is_err());
        assert!(check_success("").is_err());
    }

    /// 官方期望的成功实现：直接返回字符串 success（不带引号）
    fn reply_success(_request: &RecordedPost) -> (String, String) {
        ("HTTP/1.1 200 OK".into(), "success".into())
    }

    #[test]
    fn handshake_posts_resigned_envelope_and_expects_success() {
        let (addr, rx) = start_single_server(reply_success, Duration::ZERO);
        let url = format!("http://{addr}/auth");
        let outcome = verify_handshake(&quick_client(Duration::from_secs(2)), &url, "isv_token");

        assert!(outcome.ok, "应成功：{outcome:?}");
        let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        // 信封结构：Encrypt 为官方黄金字面量，Nonce/TimeStamp/MsgSignature 重生成
        let parsed: serde_json::Value = serde_json::from_str(&request.body).unwrap();
        assert_eq!(parsed["Encrypt"], GOLDEN_ENCRYPT);
        let nonce = parsed["Nonce"].as_str().unwrap();
        let timestamp = parsed["TimeStamp"].as_str().unwrap();
        assert!(!nonce.is_empty());
        assert_eq!(timestamp.len(), 10, "TimeStamp 为秒级时间戳：{timestamp}");
        // MsgSignature 按 TOKEN 对实际信封四值可复算
        assert_eq!(
            parsed["MsgSignature"],
            msg_signature("isv_token", nonce, timestamp, GOLDEN_ENCRYPT)
        );
    }

    #[test]
    fn handshake_fails_when_target_replies_other_than_success() {
        let responder: fn(&RecordedPost) -> (String, String) =
            |_| ("HTTP/1.1 200 OK".into(), r#""success""#.into());
        let (addr, _rx) = start_single_server(responder, Duration::ZERO);
        let url = format!("http://{addr}/auth");
        let outcome = verify_handshake(&quick_client(Duration::from_secs(2)), &url, "isv_token");

        assert!(!outcome.ok);
        assert!(outcome.message.contains("success"), "{outcome:?}");
    }

    #[test]
    fn dispatch_rebuilds_envelope_from_template_encrypt() {
        let responder: fn(&RecordedPost) -> (String, String) =
            |_| ("HTTP/1.1 200 OK".into(), "success".into());
        let (addr, rx) = start_single_server(responder, Duration::ZERO);
        let url = format!("http://{addr}/receive");
        // 前端模板载荷 = 官方黄金信封 §4.3（逐字），Encrypt 为待解密密文
        let template = r#"{"Nonce":"4464221","TimeStamp":"1535551395","Encrypt":"Encrypt xxxx","MsgSignature":"ba394c04acece6c2c0edee058c5dddf82474b8ee"}"#;

        let outcome = dispatch(
            &quick_client(Duration::from_secs(2)),
            &url,
            template,
            "isv_token",
        );

        assert_eq!(outcome.status, 200);
        assert_eq!(outcome.error, None);
        let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        // 实际发出的信封：Encrypt 原样透传，其余三要素重生成并重签
        let sent: serde_json::Value = serde_json::from_str(&request.body).unwrap();
        assert_eq!(sent["Encrypt"], "Encrypt xxxx");
        let nonce = sent["Nonce"].as_str().unwrap();
        let timestamp = sent["TimeStamp"].as_str().unwrap();
        assert_ne!(nonce, "4464221", "Nonce 每次推送重生成");
        assert_ne!(timestamp, "1535551395", "TimeStamp 每次推送重生成");
        assert_eq!(
            sent["MsgSignature"],
            msg_signature("isv_token", nonce, timestamp, GOLDEN_ENCRYPT)
        );
        // 请求快照 = 实际信封；签名/时间戳/唯一标识快照一致
        assert_eq!(outcome.request_body.as_deref(), Some(request.body.as_str()));
        assert_eq!(outcome.msg_id, nonce);
        assert_eq!(outcome.timestamp.as_deref(), Some(timestamp));
        assert_eq!(
            outcome.signature,
            sent["MsgSignature"].as_str().unwrap()
        );
    }

    #[test]
    fn dispatch_rejects_malformed_template_without_sending() {
        let outcome = dispatch(
            &quick_client(Duration::from_secs(2)),
            "http://127.0.0.1:9/receive",
            "not json",
            "isv_token",
        );
        assert_eq!(outcome.status, 0);
        assert_eq!(outcome.request_body, None, "未发出请求就没有请求快照");
        let error = outcome.error.expect("应有错误原因");
        assert!(error.contains("不是合法 JSON"), "{error}");
    }
}
