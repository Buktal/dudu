//! 企微智能机器人 JSON 通道（事实库 §2.10/§3.2/§3.5，官方 101033/100719/101027）：
//! 加解密算法与经典方案相同（复用 crypto 原语），但加密 receiveid 传空字符串；
//! 报文形态为 JSON——请求信封 `{"encrypt": msg_encrypt}`（application/json），
//! 被动回复包 `{"encrypt": "...", "msgsignature": "...", "timestamp": ..., "nonce": ...}`
//! （官方注明 nonce 需复用回调 url 中的 nonce）。明文 JSON 逐字节透传，不重排。

use super::super::{request_error_reason, ConnectionConfig, DispatchOutcome};
use super::{build_signature, decrypt_msg, encrypt_msg, random_16};
use crate::connections::util::now_secs;

/// POST 业务推送信封（官方 §3.5 JSON 版单字段信封；明文 JSON 密文原样入 encrypt）。
fn build_envelope_json(msg_encrypt: &str) -> String {
    serde_json::json!({ "encrypt": msg_encrypt }).to_string()
}

/// 从回执 JSON 提取加密被动回复的 encrypt 字段（§3.5 JSON 包结构；无则 None）。
fn extract_reply_encrypt(body: &str) -> Option<String> {
    let parsed: serde_json::Value = serde_json::from_str(body).ok()?;
    parsed.get("encrypt")?.as_str().map(str::to_string)
}

/// 机器人直发一条事件：明文 JSON → 加密信封（receiveid=空串）→
/// 四值字典序签名 → application/json POST（msg_signature/timestamp/nonce 查询参数）。
/// 回执按企微语义处理：空串 / success 原样返回；若回执是 §3.5 JSON 加密被动
/// 回复包则解密出明文一并返回（入运行记录）。
///
/// 未发出请求即失败（配置不匹配/加密失败）走 [`DispatchOutcome::not_sent`]。
/// 私有协议原语：对外只经 [`super::Adapter`]（super::super::ChannelAdapter）路由。
pub(super) fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let ConnectionConfig::Wecom {
        url,
        token,
        encoding_aes_key,
        ..
    } = config
    else {
        return DispatchOutcome::not_sent("配置不是企业微信渠道，无法直发");
    };

    let msg_encrypt = match encrypt_msg(encoding_aes_key, &random_16(), plaintext.as_bytes(), "") {
        Ok(value) => value,
        Err(reason) => return DispatchOutcome::not_sent(reason),
    };
    let timestamp = now_secs().to_string();
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let signature = build_signature(token, &timestamp, &nonce, &msg_encrypt);
    let envelope = build_envelope_json(&msg_encrypt);
    let started = std::time::Instant::now();

    let response = client
        .post(url)
        .query(&[
            ("msg_signature", signature.as_str()),
            ("timestamp", timestamp.as_str()),
            ("nonce", nonce.as_str()),
        ])
        .header("Content-Type", "application/json")
        .body(envelope.clone())
        .send();

    let elapsed_ms = started.elapsed().as_millis() as u64;
    match response {
        Ok(response) => {
            let status = response.status().as_u16();
            let body = response.text().unwrap_or_default();
            let reply = extract_reply_encrypt(&body).and_then(|encrypt| {
                decrypt_msg(encoding_aes_key, &encrypt)
                    .ok()
                    .map(|decrypted| String::from_utf8_lossy(&decrypted.msg).to_string())
            });
            DispatchOutcome {
                // 企微的发送唯一标识即 nonce（RunStep.msg_id 快照）
                msg_id: nonce,
                signature,
                timestamp: Some(timestamp),
                request_body: Some(envelope),
                reply,
                status,
                elapsed_ms,
                body,
                error: None,
            }
        }
        Err(err) => DispatchOutcome {
            msg_id: nonce,
            signature,
            timestamp: Some(timestamp),
            request_body: Some(envelope),
            reply: None,
            status: 0,
            elapsed_ms,
            body: String::new(),
            error: Some(format!("{}：{err}", request_error_reason(&err, ""))),
        },
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::time::Duration;

    use super::super::crypto::{
        GOLDEN_ENCODING_AES_KEY, GOLDEN_TOKEN, GOLDEN_CORP_ID,
    };
    use crate::connections::{ConnectionConfig, WecomSystem};
    use crate::test_support::{
        quick_client, query_params, run_dispatch_case, run_handshake_case, start_serial_server,
        status_responder, Responder,
    };

    use super::*;

    /// 机器人通道连接配置（凭据沿用官方黄金例；receiveid 恒为空串不进配置）。
    fn aibot_config(url: String) -> ConnectionConfig {
        ConnectionConfig::Wecom {
            url,
            system: WecomSystem::Aibot,
            corp_id: GOLDEN_CORP_ID.into(),
            token: GOLDEN_TOKEN.into(),
            encoding_aes_key: GOLDEN_ENCODING_AES_KEY.into(),
            agent_id: "218".into(),
        }
    }

    #[test]
    fn handshake_encrypts_with_empty_receiveid_and_expects_echo() {
        let (_outcome, request) = run_handshake_case(
            |request| {
                let query = query_params(&request.request_line);
                let decrypted =
                    decrypt_msg(GOLDEN_ENCODING_AES_KEY, &query["echostr"]).unwrap();
                // 机器人通道语义：receiveid 必须是空串（官方 §4.4/101033）
                assert_eq!(decrypted.receiveid, "", "机器人握手 receiveid 应为空串");
                (
                    "HTTP/1.1 200 OK".into(),
                    String::from_utf8(decrypted.msg).unwrap(),
                )
            },
            Duration::ZERO,
            Duration::from_secs(2),
            |addr| aibot_config(format!("http://{addr}/aibot")),
            super::super::verify_handshake,
            true,
            &[],
        );

        assert!(
            request.request_line.starts_with("GET /aibot"),
            "{}",
            request.request_line
        );
        // echostr 可解出非空明文且 receiveid 为空（与 XML 通道的关键差异）
        let query = query_params(&request.request_line);
        let decrypted = decrypt_msg(GOLDEN_ENCODING_AES_KEY, &query["echostr"]).unwrap();
        assert!(!decrypted.msg.is_empty());
        assert_eq!(decrypted.receiveid, "");
        // 签名 = sha1(token/timestamp/nonce/echostr 四值字典序拼接)
        assert_eq!(
            query["msg_signature"],
            build_signature(
                GOLDEN_TOKEN,
                &query["timestamp"],
                &query["nonce"],
                &query["echostr"]
            )
        );
    }

    /// 官方黄金样本 §5.7 机器人 JSON 回调明文（逐字）。
    const GOLDEN_AIBOT_JSON: &str = concat!(
        r#"{"msgid": "CAIQ16HMjQYY/NGagIOAgAMgq4KM0AI=", "#,
        r#""aibotid": "AIBOTID", "#,
        r#""chatid": "CHATID", "#,
        r#""chattype": "group", "#,
        r#""from": {"userid": "USERID"}, "#,
        r#""response_url": "RESPONSEURL", "#,
        r#""msgtype": "text", "#,
        r#""text": {"content": "@RobotA hello robot"}}"#,
    );

    /// 测试侧独立提取 JSON 信封密文（不复用生产实现，避免同函数自证）。
    fn naive_extract_encrypt(envelope: &str) -> String {
        let parsed: serde_json::Value = serde_json::from_str(envelope).expect("信封应为合法 JSON");
        parsed["encrypt"].as_str().expect("信封应有 encrypt").into()
    }

    #[test]
    fn dispatch_delivers_json_envelope_independently_decryptable() {
        let (outcome, request) = run_dispatch_case(
            status_responder("HTTP/1.1 200 OK", ""),
            GOLDEN_AIBOT_JSON,
            Duration::ZERO,
            Duration::from_secs(2),
            |addr| aibot_config(format!("http://{addr}/aibot")),
            dispatch_event,
        );

        assert_eq!(outcome.status, 200);
        assert_eq!(outcome.body, "");
        assert_eq!(outcome.reply, None);
        assert_eq!(outcome.error, None);

        assert!(request.request_line.starts_with("POST /aibot?"));
        let query = query_params(&request.request_line);
        for key in ["msg_signature", "timestamp", "nonce"] {
            assert!(query.contains_key(key), "缺少 {key} 参数：{query:?}");
        }
        assert_eq!(
            request.header("Content-Type").as_deref(),
            Some("application/json"),
            "机器人通道为 JSON 信封"
        );
        // 信封逐字节等于官方形态：单字段 {"encrypt": ...}（serde 紧凑键序）
        let ciphertext = naive_extract_encrypt(&request.body);
        assert_eq!(request.body, format!(r#"{{"encrypt":"{ciphertext}"}}"#));
        // 独立解密回原明文，receiveid 必须为空串（机器人通道核心语义）
        let decrypted = decrypt_msg(GOLDEN_ENCODING_AES_KEY, &ciphertext).unwrap();
        assert_eq!(decrypted.msg, GOLDEN_AIBOT_JSON.as_bytes());
        assert_eq!(decrypted.receiveid, "");
        // msg_signature = sha1(token/timestamp/nonce/密文 四值字典序)，与快照一致
        assert_eq!(
            query["msg_signature"],
            build_signature(
                GOLDEN_TOKEN,
                &query["timestamp"],
                &query["nonce"],
                &ciphertext
            )
        );
        assert_eq!(outcome.signature, query["msg_signature"]);
        assert_eq!(outcome.msg_id, query["nonce"]);
    }

    #[test]
    fn dispatch_decrypts_json_encrypted_passive_reply() {
        // 官方 §3.5 JSON 被动回复包：encrypt + msgsignature + timestamp + nonce
        let reply_plaintext = r#"{"msgtype":"text","text":{"content":"收到"}}"#;
        let reply_encrypt =
            encrypt_msg(GOLDEN_ENCODING_AES_KEY, &[5u8; 16], reply_plaintext.as_bytes(), "").unwrap();
        let reply_envelope = format!(
            r#"{{"encrypt": "{reply_encrypt}", "msgsignature": "sig", "timestamp": 1409659813, "nonce": "1372623149"}}"#
        );
        let responder: Responder = Arc::new(move |_, _, _| {
            ("HTTP/1.1 200 OK".to_string(), reply_envelope.clone())
        });
        let (addr, _rx) = start_serial_server(1, responder, Duration::ZERO);
        let config = aibot_config(format!("http://{addr}/aibot"));

        let outcome = dispatch_event(
            &quick_client(Duration::from_secs(2)),
            &config,
            GOLDEN_AIBOT_JSON,
        );

        assert_eq!(outcome.status, 200);
        assert_eq!(outcome.reply.as_deref(), Some(reply_plaintext));
        assert_eq!(outcome.error, None);
    }

    #[test]
    fn golden_ciphertext_chain_anchors_shared_crypto_and_agent_divergence() {
        // 官方黄金例锚点：同一份 AES 原语下，自建应用密文的明文按机器人语义
        // （receiveid=空串）重加密后可独立解回——证明两通道同算法、仅 receiveid 不同。
        let golden = decrypt_msg(GOLDEN_ENCODING_AES_KEY, super::super::crypto::GOLDEN_ENCRYPT)
            .expect("黄金密文应可解密");
        assert_eq!(golden.receiveid, GOLDEN_CORP_ID, "自建应用 receiveid = corpId");
        assert!(golden.msg.starts_with(b"<xml>"), "自建应用明文为 XML");

        let aibot_encrypt = encrypt_msg(
            GOLDEN_ENCODING_AES_KEY,
            &[9u8; 16],
            &golden.msg,
            "",
        )
        .expect("机器人语义重加密应成功");
        let aibot_decrypted = decrypt_msg(GOLDEN_ENCODING_AES_KEY, &aibot_encrypt).unwrap();
        assert_eq!(aibot_decrypted.msg, golden.msg);
        assert_eq!(aibot_decrypted.receiveid, "", "机器人 receiveid = 空串");
    }

    #[test]
    fn dispatch_rejects_non_wecom_config() {
        let config = ConnectionConfig::Douyin {
            url: "http://127.0.0.1:1/hook".into(),
            system: crate::connections::DouyinSystem::Dop,
            client_key: "tt_key".into(),
            client_secret: "tt_secret".into(),
            mini_game_token: String::new(),
            isv_token: String::new(),
            isv_key: String::new(),
        };
        let outcome = dispatch_event(&quick_client(Duration::from_secs(2)), &config, "{}");
        assert_eq!(outcome.status, 0);
        assert!(outcome.error.unwrap().contains("不是企业微信渠道"));
    }
}
