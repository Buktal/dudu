//! 小程序 POST XML 直发三模式（事实库 §3.3/§4.1，与公众号同族）：
//! - [`dispatch_plain`] 明文模式：明文 XML 逐字节直发，URL 仅三参 signature
//!   （官方明文算例三参签名为 899cf89e…，事实库 §5.1 推送 URL）
//! - [`dispatch_compatible`] 兼容模式：明文与密文并存——官方无并排包核验
//!   样本（事实库 §3.1 仅三选一口径），mock 沿用公众号同族实现：明文元素在
//!   前、`<Encrypt>` 殿后、其余字节不动；URL 加 encrypt_type=aes + msg_signature
//! - [`dispatch_secure`] 安全模式（官方强烈推荐）：收包仅两字段信封
//!   `<ToUserName>+<Encrypt>`（事实库 §3.3 安全模式包体口径；官方样例为
//!   JSON 形态、XML 信封待核验(09-27)，按公众号同族 ToUserName+Encrypt 同名
//!   两字段实现）；URL 同兼容
//!
//! URL 参数（事实库 §3.3 官方 URL 例）：明文模式 query 为
//! signature/timestamp/nonce；安全模式追加 openid/encrypt_type=aes/
//! msg_signature（官方示例 URL 原样）；**密文校验用 msg_signature 而非
//! signature**（事实库 §3.3 官方注意原文）。回执：明文模式正文即应答；
//! 加密两模式若回加密回包信封（Encrypt/MsgSignature/TimeStamp/Nonce），
//! 提取密文解密出明文一并返回（尾部 AppId 校验，super::decrypt_reply）；
//! 信封支持 XML 与 JSON（事实库 §5.6 逐字样本）双形态。明文不重排（ADR-0001）。

use crate::connections::wecom::crypto::encrypt_msg;
use crate::connections::wecom::random_16;

use super::super::{request_error_reason, ConnectionConfig, DispatchOutcome};
use super::{
    build_callback_signature, build_msg_signature, decrypt_reply, random_openid,
    unix_timestamp_secs,
};

/// 安全模式收包信封（事实库 §3.3：仅 ToUserName + Encrypt 两字段，XML 按
/// 公众号同族；官方样例为 JSON 形态）。ToUserName 官方为小程序原始 ID
/// （gh_ 开头）；连接配置只存 AppID（解密校验以密文尾部 AppId 为准），
/// mock 以配置的 AppID 落位。
fn build_secure_envelope(app_id: &str, msg_encrypt: &str) -> String {
    format!(
        "<xml><ToUserName><![CDATA[{app_id}]]></ToUserName>\
         <Encrypt><![CDATA[{msg_encrypt}]]></Encrypt></xml>"
    )
}

/// 兼容模式「明文+密文并存」包：明文 XML 逐字节保留，`<Encrypt>` 元素
/// 内嵌在收尾 `</xml>` 之前（明文元素在前、密文殿后；官方无并排包样本，
/// 事实库 §3.1 口径为三选一，mock 沿用公众号同族实现）。
fn build_compatible_body(plaintext: &str, msg_encrypt: &str) -> String {
    const CLOSE: &str = "</xml>";
    match plaintext.strip_suffix(CLOSE) {
        Some(head) => format!("{head}<Encrypt><![CDATA[{msg_encrypt}]]></Encrypt>\n{CLOSE}"),
        None => format!("{plaintext}\n<Encrypt><![CDATA[{msg_encrypt}]]></Encrypt>"),
    }
}

/// 从回执文本提取加密回包的 Encrypt 密文（无则 None）。双信封形态：
/// - XML（公众号同族）：`<Encrypt><![CDATA[密文]]></Encrypt>`
/// - JSON（事实库 §5.6 官方样本）：`"Encrypt": "密文"`
fn extract_reply_encrypt(body: &str) -> Option<&str> {
    const XML_OPEN: &str = "<Encrypt><![CDATA[";
    if let Some(start) = body.find(XML_OPEN) {
        let start = start + XML_OPEN.len();
        let end = start + body[start..].find("]]>")?;
        return Some(&body[start..end]);
    }
    const JSON_KEY: &str = "\"Encrypt\"";
    let key_at = body.find(JSON_KEY)?;
    let colon_at = key_at + body[key_at..].find(':')? + 1;
    let quote_at = colon_at + body[colon_at..].find('"')? + 1;
    let end = quote_at + body[quote_at..].find('"')?;
    Some(&body[quote_at..end])
}

/// 直发公共体：query/body 由各模式拼定，POST text/xml + 回执归一
/// （明文应答原样 / 加密回包解密入记录）。signature 为快照主签名
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
    let ConnectionConfig::WechatMini {
        app_id, encoding_aes_key, ..
    } = config
    else {
        return DispatchOutcome::not_sent("配置不是微信小程序渠道，无法直发");
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
                // 小程序的发送唯一标识即 nonce（RunStep.msg_id 快照）
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
    let ConnectionConfig::WechatMini { url, .. } = config else {
        return "";
    };
    url
}

/// 公共 query 三件套 + openid（事实库 §3.3 安全模式官方 URL 例带 openid；
/// 明文模式 mock 同公众号实现一并发送，openid 标识模拟用户）。
fn common_query(config: &ConnectionConfig, timestamp: &str, nonce: &str) -> Vec<(&'static str, String)> {
    let ConnectionConfig::WechatMini { token, .. } = config else {
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
    let ConnectionConfig::WechatMini {
        token,
        app_id,
        encoding_aes_key,
        ..
    } = config
    else {
        return Err("配置不是微信小程序渠道，无法加密封装".into());
    };
    let msg_encrypt =
        encrypt_msg(encoding_aes_key, &random_16(), plaintext.as_bytes(), app_id)?;
    let timestamp = unix_timestamp_secs().to_string();
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let signature = build_msg_signature(token, &timestamp, &nonce, &msg_encrypt);
    Ok((msg_encrypt, timestamp, nonce, signature))
}

/// 明文模式直发：明文 XML 逐字节为 body，URL 无加密参数（事实库 §3.3）。
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
    let ConnectionConfig::WechatMini { app_id, .. } = config else {
        return DispatchOutcome::not_sent("配置不是微信小程序渠道，无法直发");
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
