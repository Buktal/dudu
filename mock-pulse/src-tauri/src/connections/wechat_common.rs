//! 微信族（公众号 wechat_mp / 小程序 wechat_mini）POST 直发共享骨架：
//! 三模式（明文/兼容/安全）的 query 拼装、AES 信封加密封装、POST text/xml
//! 归一与加密回执解密为同族同构实现，单点收敛在本模块；渠道差异点留在各自
//! push 模块（凭证字段解构、回执信封形态、配置判别文案）——ADR-0001。
//!
//! 三模式（与官方服务器配置「消息加解密方式」三选一对应）：
//! - [`dispatch_plain`] 明文模式：明文 XML 逐字节直发，URL 无加密参数
//!   （仅三参 signature 验签）
//! - [`dispatch_compatible`] 兼容模式：明文与密文并存包，URL 加
//!   encrypt_type=aes + msg_signature
//! - [`dispatch_secure`] 安全模式：仅两字段密文信封 `<ToUserName>+<Encrypt>`，
//!   URL 同兼容
//!
//! URL 参数（事实库 wechat-mp §5.14 / wechat-mini §3.3 官方 URL 例）：
//! signature/timestamp/nonce/openid 三模式通用，加密两模式追加
//! encrypt_type=aes + msg_signature（四参含密文，**密文校验用 msg_signature
//! 而非 signature**）。回执：明文模式正文即应答；加密两模式若回加密回包信封
//! （Encrypt/MsgSignature/TimeStamp/Nonce），经渠道传入的
//! `extract_reply_encrypt` 提取密文解密出明文一并返回（尾部 AppId 校验，
//! [`decrypt_reply`]）。明文不重排（ADR-0001）。
//!
//! AES 原语复用企微同族（`wecom::crypto`，同一套 32 字节 PKCS#7，小红书
//! 同例）；三参 signature 与四参 msg_signature 同 sha1 字典序排序族
//! （util::sha1_sorted_hex）。

pub(crate) use crate::connections::util::callback_signature as build_callback_signature;
// XML 信封密文提取单点在 wecom（企微 §3.5 与公众号 §5.14 同一 XML 包结构），
// 此处按既有族共享骨架路径转发给各渠道 push 模块。
use crate::connections::util::{now_secs, sha1_sorted_hex};
use crate::connections::wecom::crypto::{decrypt_msg, encrypt_msg};
pub(crate) use crate::connections::wecom::extract_reply_encrypt;
use crate::connections::wecom::random_16;

use super::{send_measured_outcome, DispatchOutcome, DispatchSnapshot};

/// 微信族直发凭证：两渠道连接配置（WechatMp/WechatMini）同名字段的借用投影。
/// 凭证字段解构（配置变体匹配）留在各渠道 push 模块，本模块只见同形四元组。
pub(crate) struct Creds<'a> {
    /// 直发目标 URL（连接配置）
    pub url: &'a str,
    /// 服务器配置 Token（三参 signature 与四参 msg_signature 签名源）
    pub token: &'a str,
    /// AppID（安全模式信封 ToUserName；回执解密的尾部 AppId 校验源）
    pub app_id: &'a str,
    /// 43 位 EncodingAESKey（AES 信封派生源；明文模式可不填）
    pub encoding_aes_key: &'a str,
}

/// 兼容/安全的四参 msg_signature：sha1(字典序排序(token, timestamp, nonce,
/// Encrypt) 后拼接)（事实库 wechat-mp §4.3 / wechat-mini §4.2，与企微
/// msg_signature 同族）。
pub(crate) fn build_msg_signature(
    token: &str,
    timestamp: &str,
    nonce: &str,
    msg_encrypt: &str,
) -> String {
    sha1_sorted_hex(&[token, timestamp, nonce, msg_encrypt])
}

/// 模拟用户的 openid（URL 参数透传；官方样本为 28 位无连字符串/`o` 开头串，
/// mock 取 uuid simple 32 位 hex 同风格无连字符）。
pub(crate) fn random_openid() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// 解密加密回执并校验尾部 AppId（官方「appid 须校验」，与企微 receiveid 同位：
/// 事实库 wechat-mp §4.4 / wechat-mini §4.3）。校验失败返回 None（回执正文
/// 仍原样入记录）。
fn decrypt_reply(encoding_aes_key: &str, encrypt: &str, app_id: &str) -> Option<String> {
    let decrypted = decrypt_msg(encoding_aes_key, encrypt).ok()?;
    if decrypted.receiveid != app_id {
        return None;
    }
    Some(String::from_utf8_lossy(&decrypted.msg).to_string())
}

/// 安全模式收包信封（官方 §3.3：仅 ToUserName + Encrypt 两字段）。ToUserName
/// 官方为开发者微信号/小程序原始 ID（gh_ 开头）；连接配置只存 AppID（解密
/// 校验以密文尾部 AppId 为准），mock 以配置的 AppID 落位。
fn build_secure_envelope(app_id: &str, msg_encrypt: &str) -> String {
    format!(
        "<xml><ToUserName><![CDATA[{app_id}]]></ToUserName>\
         <Encrypt><![CDATA[{msg_encrypt}]]></Encrypt></xml>"
    )
}

/// 兼容模式「明文+密文并存」包：明文 XML 逐字节保留，`<Encrypt>` 元素内嵌
/// 在收尾 `</xml>` 之前（明文元素在前、密文殿后；官方无并排包核验样本，
/// 事实库 wechat-mp §4.1 / wechat-mini §3.1 仅口径，mock 取公众号同族实现）。
fn build_compatible_body(plaintext: &str, msg_encrypt: &str) -> String {
    const CLOSE: &str = "</xml>";
    match plaintext.strip_suffix(CLOSE) {
        Some(head) => format!("{head}<Encrypt><![CDATA[{msg_encrypt}]]></Encrypt>\n{CLOSE}"),
        None => format!("{plaintext}\n<Encrypt><![CDATA[{msg_encrypt}]]></Encrypt>"),
    }
}

/// 公共 query 三件套 + openid（官方 URL 例三模式通用部分；openid 标识模拟
/// 用户，明文模式同样发送）。
fn common_query(creds: &Creds<'_>, timestamp: &str, nonce: &str) -> Vec<(&'static str, String)> {
    vec![
        (
            "signature",
            build_callback_signature(creds.token, timestamp, nonce),
        ),
        ("timestamp", timestamp.to_string()),
        ("nonce", nonce.to_string()),
        ("openid", random_openid()),
    ]
}

/// 加密封装公共体（加密两模式共用）：明文 → AES 信封密文（尾部 AppId，复用
/// 企微 AES 原语）→ 四参 msg_signature + 时间戳/nonce。
fn seal_plaintext(
    creds: &Creds<'_>,
    plaintext: &str,
) -> Result<(String, String, String, String), String> {
    let msg_encrypt = encrypt_msg(
        creds.encoding_aes_key,
        &random_16(),
        plaintext.as_bytes(),
        creds.app_id,
    )?;
    let timestamp = now_secs().to_string();
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let signature = build_msg_signature(creds.token, &timestamp, &nonce, &msg_encrypt);
    Ok((msg_encrypt, timestamp, nonce, signature))
}

/// 直发公共体：query/body 由各模式拼定，POST text/xml + 回执归一（明文应答
/// 原样 / 加密回执经 `extract_reply_encrypt` 提取密文解密入记录——公众号仅
/// XML、小程序 XML+JSON 双形态，函数指针由各渠道传入）。signature 为快照
/// 主签名（明文=三参 signature，加密=四参 msg_signature）；发送唯一标识即
/// nonce（RunStep.msg_id 快照）。
fn dispatch(
    client: &reqwest::blocking::Client,
    creds: &Creds<'_>,
    extract_reply_encrypt: fn(&str) -> Option<&str>,
    query: Vec<(&'static str, String)>,
    body: String,
    signature: String,
    timestamp: String,
    nonce: String,
) -> DispatchOutcome {
    let request = client
        .post(creds.url)
        .query(&query)
        .header("Content-Type", "text/xml")
        .body(body.clone());
    send_measured_outcome(
        request,
        "",
        DispatchSnapshot {
            msg_id: nonce,
            signature,
            timestamp: Some(timestamp),
            request_body: Some(body),
        },
        |_, receipt| {
            extract_reply_encrypt(receipt)
                .and_then(|encrypt| decrypt_reply(creds.encoding_aes_key, encrypt, creds.app_id))
        },
    )
}

/// 明文模式直发：明文 XML 逐字节为 body，URL 无加密参数（仅三参 signature）。
pub(crate) fn dispatch_plain(
    client: &reqwest::blocking::Client,
    creds: &Creds<'_>,
    extract_reply_encrypt: fn(&str) -> Option<&str>,
    plaintext: &str,
) -> DispatchOutcome {
    let timestamp = now_secs().to_string();
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let query = common_query(creds, &timestamp, &nonce);
    let signature = query
        .iter()
        .find(|(key, _)| *key == "signature")
        .map(|(_, value)| value.clone())
        .unwrap_or_default();
    dispatch(
        client,
        creds,
        extract_reply_encrypt,
        query,
        plaintext.to_string(),
        signature,
        timestamp,
        nonce,
    )
}

/// 兼容模式直发：明文与密文并存包 + encrypt_type=aes + msg_signature。
pub(crate) fn dispatch_compatible(
    client: &reqwest::blocking::Client,
    creds: &Creds<'_>,
    extract_reply_encrypt: fn(&str) -> Option<&str>,
    plaintext: &str,
) -> DispatchOutcome {
    let (msg_encrypt, timestamp, nonce, signature) = match seal_plaintext(creds, plaintext) {
        Ok(values) => values,
        Err(reason) => return DispatchOutcome::not_sent(reason),
    };
    let mut query = common_query(creds, &timestamp, &nonce);
    query.push(("encrypt_type", "aes".to_string()));
    query.push(("msg_signature", signature.clone()));
    dispatch(
        client,
        creds,
        extract_reply_encrypt,
        query,
        build_compatible_body(plaintext, &msg_encrypt),
        signature,
        timestamp,
        nonce,
    )
}

/// 安全模式直发：仅两字段密文信封（ToUserName + Encrypt）+ encrypt_type=aes
/// + msg_signature。
pub(crate) fn dispatch_secure(
    client: &reqwest::blocking::Client,
    creds: &Creds<'_>,
    extract_reply_encrypt: fn(&str) -> Option<&str>,
    plaintext: &str,
) -> DispatchOutcome {
    let (msg_encrypt, timestamp, nonce, signature) = match seal_plaintext(creds, plaintext) {
        Ok(values) => values,
        Err(reason) => return DispatchOutcome::not_sent(reason),
    };
    let mut query = common_query(creds, &timestamp, &nonce);
    query.push(("encrypt_type", "aes".to_string()));
    query.push(("msg_signature", signature.clone()));
    dispatch(
        client,
        creds,
        extract_reply_encrypt,
        query,
        build_secure_envelope(creds.app_id, &msg_encrypt),
        signature,
        timestamp,
        nonce,
    )
}
