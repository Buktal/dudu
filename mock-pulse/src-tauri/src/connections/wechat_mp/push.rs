//! 公众号 POST XML 直发三模式（事实库 §3.3/§4.1/§5.14，官方 encryption.html）：
//! - [`dispatch_plain`] 明文模式（官方默认）：明文 XML 逐字节直发，
//!   URL 无加密参数（仅三参 signature 验签）
//! - [`dispatch_compatible`] 兼容模式（调试过渡）：明文与密文并存——
//!   官方无并排包核验样本（事实库 §4.1 仅口径），mock 取明文元素在前、
//!   `<Encrypt>` 殿后、其余字节不动；URL 加 encrypt_type=aes + msg_signature
//! - [`dispatch_secure`] 安全模式（官方推荐）：收包仅两字段信封
//!   `<ToUserName>+<Encrypt>`（事实库 §3.3/§5.14），URL 同兼容
//!
//! URL 参数（事实库 §5.14 官方 URL 例）：signature/timestamp/nonce/openid
//! 三模式通用，加密两模式追加 encrypt_type=aes + msg_signature（四参含密文）。
//! 回执：明文模式正文即应答；加密两模式若回 §5.14 加密被动回复包
//! （Encrypt/MsgSignature/TimeStamp/Nonce），解密出明文一并返回（尾部 AppId
//! 校验，super::decrypt_reply）。明文不重排（ADR-0001）。

use crate::connections::wecom::crypto::encrypt_msg;
use crate::connections::wecom::random_16;

use super::super::{request_error_reason, ConnectionConfig, DispatchOutcome};
use super::{
    build_callback_signature, build_msg_signature, decrypt_reply, random_openid,
    unix_timestamp_secs,
};

/// 安全模式收包信封（官方 §3.3/§5.14：仅 ToUserName + Encrypt 两字段）。
/// ToUserName 官方为开发者微信号（gh_ 开头）；连接配置只存 AppID（解密校验
/// 以密文尾部 AppId 为准），mock 以配置的 AppID 落位。
fn build_secure_envelope(app_id: &str, msg_encrypt: &str) -> String {
    format!(
        "<xml><ToUserName><![CDATA[{app_id}]]></ToUserName>\
         <Encrypt><![CDATA[{msg_encrypt}]]></Encrypt></xml>"
    )
}

/// 兼容模式「明文+密文并存」包：明文 XML 逐字节保留，`<Encrypt>` 元素
/// 内嵌在收尾 `</xml>` 之前（明文元素在前、密文殿后；官方无并排包样本，
/// 事实库 §4.1 口径为包长约 3 倍的明文密文并存）。
fn build_compatible_body(plaintext: &str, msg_encrypt: &str) -> String {
    const CLOSE: &str = "</xml>";
    match plaintext.strip_suffix(CLOSE) {
        Some(head) => format!("{head}<Encrypt><![CDATA[{msg_encrypt}]]></Encrypt>\n{CLOSE}"),
        None => format!("{plaintext}\n<Encrypt><![CDATA[{msg_encrypt}]]></Encrypt>"),
    }
}

/// 从回执文本提取加密被动回复的 Encrypt 密文（§5.14 XML 包结构；无则 None）。
fn extract_reply_encrypt(body: &str) -> Option<&str> {
    const OPEN: &str = "<Encrypt><![CDATA[";
    let start = body.find(OPEN)? + OPEN.len();
    let end = start + body[start..].find("]]>")?;
    Some(&body[start..end])
}

/// 直发公共体：query/body 由各模式拼定，POST text/xml + 回执归一
/// （明文应答原样 / 加密被动回复解密入记录）。signature 为快照主签名
/// （明文=三参 signature，加密=四参 msg_signature）。
///
/// 未发出请求即失败（配置不匹配/加密失败）走 [`DispatchOutcome::not_sent`]：
/// 协议要素不落值，零回执 + 失败原因。
fn dispatch(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    query: Vec<(&'static str, String)>,
    body: String,
    signature: String,
    timestamp: String,
    nonce: String,
) -> DispatchOutcome {
    let ConnectionConfig::WechatMp {
        app_id, encoding_aes_key, ..
    } = config
    else {
        return DispatchOutcome::not_sent("配置不是微信公众号渠道，无法直发");
    };

    let started = std::time::Instant::now();
    let response = client
        .post(url_of(config))
        .query(&query)
        .header("Content-Type", "text/xml")
        .body(body.clone())
        .send();

    let elapsed_ms = started.elapsed().as_millis() as u64;
    match response {
        Ok(response) => {
            let status = response.status().as_u16();
            let receipt = response.text().unwrap_or_default();
            let reply = extract_reply_encrypt(&receipt)
                .and_then(|encrypt| decrypt_reply(encoding_aes_key, encrypt, app_id));
            DispatchOutcome {
                // 公众号的发送唯一标识即 nonce（RunStep.msg_id 快照）
                msg_id: nonce,
                signature,
                timestamp: Some(timestamp),
                request_body: Some(body),
                reply,
                status,
                elapsed_ms,
                body: receipt,
                error: None,
            }
        }
        Err(err) => DispatchOutcome {
            msg_id: nonce,
            signature,
            timestamp: Some(timestamp),
            request_body: Some(body),
            reply: None,
            status: 0,
            elapsed_ms,
            body: String::new(),
            error: Some(format!("{}：{err}", request_error_reason(&err, ""))),
        },
    }
}

fn url_of(config: &ConnectionConfig) -> &str {
    let ConnectionConfig::WechatMp { url, .. } = config else {
        return "";
    };
    url
}

/// 公共 query 三件套 + openid（事实库 §5.14 官方 URL 例三模式通用部分）。
fn common_query(config: &ConnectionConfig, timestamp: &str, nonce: &str) -> Vec<(&'static str, String)> {
    let ConnectionConfig::WechatMp { token, .. } = config else {
        return Vec::new();
    };
    vec![
        ("signature", build_callback_signature(token, timestamp, nonce)),
        ("timestamp", timestamp.to_string()),
        ("nonce", nonce.to_string()),
        ("openid", random_openid()),
    ]
}

/// 加密封装公共体：明文 → AES 信封密文（尾部 AppId，复用企微 AES 原语）→
/// 四参 msg_signature + 时间戳/nonce（加密两模式共用）。
fn encrypt_plaintext(
    config: &ConnectionConfig,
    plaintext: &str,
) -> Result<(String, String, String, String), String> {
    let ConnectionConfig::WechatMp {
        token,
        app_id,
        encoding_aes_key,
        ..
    } = config
    else {
        return Err("配置不是微信公众号渠道，无法加密封装".into());
    };
    let msg_encrypt =
        encrypt_msg(encoding_aes_key, &random_16(), plaintext.as_bytes(), app_id)?;
    let timestamp = unix_timestamp_secs().to_string();
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let signature = build_msg_signature(token, &timestamp, &nonce, &msg_encrypt);
    Ok((msg_encrypt, timestamp, nonce, signature))
}

/// 明文模式直发：明文 XML 逐字节为 body，URL 无加密参数（事实库 §4.1）。
pub(super) fn dispatch_plain(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let timestamp = unix_timestamp_secs().to_string();
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let query = common_query(config, &timestamp, &nonce);
    let signature = query
        .iter()
        .find(|(key, _)| *key == "signature")
        .map(|(_, value)| value.clone())
        .unwrap_or_default();
    dispatch(
        client,
        config,
        query,
        plaintext.to_string(),
        signature,
        timestamp,
        nonce,
    )
}

/// 兼容模式直发：明文与密文并存包 + encrypt_type=aes + msg_signature。
pub(super) fn dispatch_compatible(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let (msg_encrypt, timestamp, nonce, signature) = match encrypt_plaintext(config, plaintext) {
        Ok(values) => values,
        Err(reason) => return DispatchOutcome::not_sent(reason),
    };
    let mut query = common_query(config, &timestamp, &nonce);
    query.push(("encrypt_type", "aes".to_string()));
    query.push(("msg_signature", signature.clone()));
    dispatch(
        client,
        config,
        query,
        build_compatible_body(plaintext, &msg_encrypt),
        signature,
        timestamp,
        nonce,
    )
}

/// 安全模式直发：仅两字段密文信封 + encrypt_type=aes + msg_signature。
pub(super) fn dispatch_secure(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let ConnectionConfig::WechatMp { app_id, .. } = config else {
        return DispatchOutcome::not_sent("配置不是微信公众号渠道，无法直发");
    };
    let (msg_encrypt, timestamp, nonce, signature) = match encrypt_plaintext(config, plaintext) {
        Ok(values) => values,
        Err(reason) => return DispatchOutcome::not_sent(reason),
    };
    let mut query = common_query(config, &timestamp, &nonce);
    query.push(("encrypt_type", "aes".to_string()));
    query.push(("msg_signature", signature.clone()));
    dispatch(
        client,
        config,
        query,
        build_secure_envelope(app_id, &msg_encrypt),
        signature,
        timestamp,
        nonce,
    )
}
