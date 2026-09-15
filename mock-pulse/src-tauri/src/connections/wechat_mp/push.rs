//! 公众号 POST XML 直发三模式（事实库 §3.3/§4.1/§5.14，官方 encryption.html）。
//! 三模式骨架（query 拼装、信封加密封装、POST 归一、加密回执解密）为微信族
//! 共享实现（super::super::wechat_common），本模块只留公众号差异点：
//! - 凭证解构：ConnectionConfig::WechatMp 四字段投影为族共享 Creds
//! - 回执形态：加密被动回复仅 §5.14 XML 信封（小程序另有 §5.6 JSON 双形态）
//! - 配置判别文案：「配置不是微信公众号渠道，无法…」
//!
//! 三模式：
//! - [`dispatch_plain`] 明文模式（官方默认）：明文 XML 逐字节直发，URL 无加密
//!   参数（仅三参 signature 验签）
//! - [`dispatch_compatible`] 兼容模式（调试过渡）：明文与密文并存——官方无
//!   并排包核验样本（事实库 §4.1 仅口径），mock 取明文元素在前、`<Encrypt>`
//!   殿后、其余字节不动；URL 加 encrypt_type=aes + msg_signature
//! - [`dispatch_secure`] 安全模式（官方推荐）：收包仅两字段信封
//!   `<ToUserName>+<Encrypt>`（事实库 §3.3/§5.14），URL 同兼容
//!
//! 回执：明文模式正文即应答；加密两模式若回 §5.14 加密被动回复包
//! （Encrypt/MsgSignature/TimeStamp/Nonce），解密出明文一并返回。明文不重排
//! （ADR-0001）。

use super::super::wechat_common::{self, Creds};
use super::super::{ConnectionConfig, DispatchOutcome};

/// 公众号回执信封密文提取（§5.14 XML 包结构；无则 None）——族内差异点：
/// 小程序回执另有 JSON 信封形态，双形态提取在 wechat_mini::push。
fn extract_reply_encrypt(body: &str) -> Option<&str> {
    const OPEN: &str = "<Encrypt><![CDATA[";
    let start = body.find(OPEN)? + OPEN.len();
    let end = start + body[start..].find("]]>")?;
    Some(&body[start..end])
}

/// 连接配置 → 族共享直发凭证（WechatMp 四字段投影）。配置不是公众号渠道时
/// Err（`action` 拼入文案：明文/安全为「无法直发」、兼容为「无法加密封装」，
/// 与三处原判位逐字一致）。
fn creds_of<'a>(config: &'a ConnectionConfig, action: &str) -> Result<Creds<'a>, String> {
    let ConnectionConfig::WechatMp {
        url,
        token,
        app_id,
        encoding_aes_key,
        ..
    } = config
    else {
        return Err(format!("配置不是微信公众号渠道，无法{action}"));
    };
    Ok(Creds {
        url,
        token,
        app_id,
        encoding_aes_key,
    })
}

/// 明文模式直发：明文 XML 逐字节为 body，URL 无加密参数（事实库 §4.1）。
pub(super) fn dispatch_plain(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    match creds_of(config, "直发") {
        Ok(creds) => {
            wechat_common::dispatch_plain(client, &creds, extract_reply_encrypt, plaintext)
        }
        Err(reason) => DispatchOutcome::not_sent(reason),
    }
}

/// 兼容模式直发：明文与密文并存包 + encrypt_type=aes + msg_signature。
pub(super) fn dispatch_compatible(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    match creds_of(config, "加密封装") {
        Ok(creds) => {
            wechat_common::dispatch_compatible(client, &creds, extract_reply_encrypt, plaintext)
        }
        Err(reason) => DispatchOutcome::not_sent(reason),
    }
}

/// 安全模式直发：仅两字段密文信封 + encrypt_type=aes + msg_signature。
pub(super) fn dispatch_secure(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    match creds_of(config, "直发") {
        Ok(creds) => {
            wechat_common::dispatch_secure(client, &creds, extract_reply_encrypt, plaintext)
        }
        Err(reason) => DispatchOutcome::not_sent(reason),
    }
}
