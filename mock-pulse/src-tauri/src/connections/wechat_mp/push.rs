//! 公众号 POST XML 直发三模式（事实库 §3.3/§4.1/§5.14，官方 encryption.html）。
//! 三模式骨架（query 拼装、信封加密封装、POST 归一、加密回执解密）为微信族
//! 共享实现（super::super::wechat_common），本模块只留公众号差异点：
//! - 凭证装订：连接配置四字段由适配器收窄（narrow!）后投影为族共享 Creds
//! - 回执形态：加密被动回复仅 §5.14 XML 信封（小程序另有 §5.6 JSON 双形态）
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
use super::super::DispatchOutcome;

/// 公众号回执信封密文提取（§5.14 XML 包结构；无则 None）——族内差异点：
/// 小程序回执另有 JSON 信封形态，双形态提取在 wechat_mini::push。
fn extract_reply_encrypt(body: &str) -> Option<&str> {
    const OPEN: &str = "<Encrypt><![CDATA[";
    let start = body.find(OPEN)? + OPEN.len();
    let end = start + body[start..].find("]]>")?;
    Some(&body[start..end])
}

/// 明文模式直发：明文 XML 逐字节为 body，URL 无加密参数（事实库 §4.1）。
pub(super) fn dispatch_plain(
    client: &reqwest::blocking::Client,
    url: &str,
    token: &str,
    app_id: &str,
    encoding_aes_key: &str,
    plaintext: &str,
) -> DispatchOutcome {
    wechat_common::dispatch_plain(
        client,
        &Creds { url, token, app_id, encoding_aes_key },
        extract_reply_encrypt,
        plaintext,
    )
}

/// 兼容模式直发：明文与密文并存包 + encrypt_type=aes + msg_signature。
pub(super) fn dispatch_compatible(
    client: &reqwest::blocking::Client,
    url: &str,
    token: &str,
    app_id: &str,
    encoding_aes_key: &str,
    plaintext: &str,
) -> DispatchOutcome {
    wechat_common::dispatch_compatible(
        client,
        &Creds { url, token, app_id, encoding_aes_key },
        extract_reply_encrypt,
        plaintext,
    )
}

/// 安全模式直发：仅两字段密文信封 + encrypt_type=aes + msg_signature。
pub(super) fn dispatch_secure(
    client: &reqwest::blocking::Client,
    url: &str,
    token: &str,
    app_id: &str,
    encoding_aes_key: &str,
    plaintext: &str,
) -> DispatchOutcome {
    wechat_common::dispatch_secure(
        client,
        &Creds { url, token, app_id, encoding_aes_key },
        extract_reply_encrypt,
        plaintext,
    )
}
