//! 小程序 POST XML 直发三模式（事实库 §3.3/§4.1，与公众号同族）。
//! 三模式骨架（query 拼装、信封加密封装、POST 归一、加密回执解密）为微信族
//! 共享实现（super::super::wechat_common），本模块只留小程序差异点：
//! - 凭证装订：连接配置四字段由适配器收窄（narrow!）后投影为族共享 Creds
//! - 回执形态：加密回包信封 XML 与 JSON 双形态（JSON 为事实库 §5.6 逐字
//!   官方样本；公众号仅 XML）
//!
//! 三模式：
//! - [`dispatch_plain`] 明文模式：明文 XML 逐字节直发，URL 仅三参 signature
//!   （官方明文算例三参签名为 899cf89e…，事实库 §5.1 推送 URL）
//! - [`dispatch_compatible`] 兼容模式：明文与密文并存——官方无并排包核验
//!   样本（事实库 §3.1 仅三选一口径），mock 沿用公众号同族实现：明文元素在
//!   前、`<Encrypt>` 殿后、其余字节不动；URL 加 encrypt_type=aes +
//!   msg_signature
//! - [`dispatch_secure`] 安全模式（官方强烈推荐）：收包仅两字段信封（事实库
//!   §3.3 安全模式包体口径；官方样例为 JSON 形态、XML 信封待核验(09-27)，
//!   按公众号同族 ToUserName+Encrypt 同名两字段实现）；URL 同兼容
//!
//! **密文校验用 msg_signature 而非 signature**（事实库 §3.3 官方注意原文，
//! 族共享骨架已按此实现）。明文不重排（ADR-0001）。

use super::super::wechat_common::{self, Creds};
use super::super::DispatchOutcome;

/// 小程序回执信封密文提取（无则 None）。双信封形态——族内差异点（公众号仅
/// XML 形态）：
/// - XML（公众号同族）：`<Encrypt><![CDATA[密文]]></Encrypt>`（保持 find 定位，
///   库无源字节 span 等价表达）
/// - JSON（事实库 §5.6 官方样本）：`"Encrypt": "密文"`（serde_json 零拷贝
///   反序列化取键；Reuse-first 审计退件：曾手写 find 索引算术）
fn extract_reply_encrypt(body: &str) -> Option<&str> {
    const XML_OPEN: &str = "<Encrypt><![CDATA[";
    if let Some(start) = body.find(XML_OPEN) {
        let start = start + XML_OPEN.len();
        let end = start + body[start..].find("]]>")?;
        return Some(&body[start..end]);
    }
    #[derive(serde::Deserialize)]
    struct CipherEnvelope<'a> {
        #[serde(rename = "Encrypt")]
        encrypt: Option<&'a str>,
    }
    serde_json::from_str::<CipherEnvelope<'_>>(body)
        .ok()?
        .encrypt
}

/// 明文模式直发：明文 XML 逐字节为 body，URL 无加密参数（事实库 §3.3）。
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
        &Creds {
            url,
            token,
            app_id,
            encoding_aes_key,
        },
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
        &Creds {
            url,
            token,
            app_id,
            encoding_aes_key,
        },
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
        &Creds {
            url,
            token,
            app_id,
            encoding_aes_key,
        },
        extract_reply_encrypt,
        plaintext,
    )
}
