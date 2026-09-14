//! 微信公众号渠道（事实库 docs/research/channels/wechat-mp.md）：
//! GET 三参握手（[`build_callback_signature`] 验签 + 原样回 echostr）+
//! POST XML 三模式直发（[`push`]，明文/兼容/安全，按连接配置的
//! [`WechatMpMode`] 路由）。报文仅 XML（事实库 §2 公共约束）；
//! 加解密复用企微同族 AES 原语（`wecom::crypto`，同一套 32 字节 PKCS#7），
//! 差异——明文尾部为 AppId 且解密后须校验、receiveid=appId——留在本模块内。
//!
//! 三模式（事实库 §4.1）：
//! - 明文（官方默认）：明文 XML 直发，URL 仅三参 signature
//! - 兼容（调试过渡）：明文与密文并存，URL 加 encrypt_type=aes + msg_signature
//! - 安全（官方推荐）：仅密文信封（ToUserName + Encrypt），URL 同兼容

mod push;

#[cfg(test)]
mod tests;

use std::time::Duration;

use crate::connections::util::sha1_sorted_hex;
use crate::connections::wecom::crypto::decrypt_msg;

use super::{
    request_error_reason, ConnectionConfig, DispatchOutcome, HandshakeOutcome, WechatMpMode,
};

/// echostr 握手的随机明文：32 位 hex（官方仅要求原样回显，无内容约束）。
fn random_echostr() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

fn unix_timestamp_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0)
}

/// 模拟用户的 openid（URL 参数透传，事实库 §3.3；官方样本为 28 位无连字符串，
/// mock 取 uuid simple 32 位 hex 同风格）。
fn random_openid() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// GET 握手三参签名：sha1(字典序排序(token, timestamp, nonce)后拼接)。
/// 官方数值例（事实库 §4.2）：token=AAAAA/1714037059/486452656 → 899cf89e…。
pub(crate) fn build_callback_signature(token: &str, timestamp: &str, nonce: &str) -> String {
    sha1_sorted_hex(&[token, timestamp, nonce])
}

/// 兼容/安全的四参 msg_signature：sha1(字典序排序(token, timestamp, nonce,
/// Encrypt)后拼接)（事实库 §4.3，与企微 msg_signature 同族）。
pub(crate) fn build_msg_signature(
    token: &str,
    timestamp: &str,
    nonce: &str,
    msg_encrypt: &str,
) -> String {
    sha1_sorted_hex(&[token, timestamp, nonce, msg_encrypt])
}

/// GET 首次校验握手（事实库 §3.2 三步）：生成随机 echostr → 三参字典序签名 →
/// GET 目标 URL（signature/timestamp/nonce/echostr）→ 期望 HTTP 200 且响应体
/// 与 echostr 逐字节一致（官方要求原样返回、不加引号）。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let ConnectionConfig::WechatMp { url, token, .. } = config else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是微信公众号渠道，无法执行 GET 握手".into(),
        };
    };
    let echostr = random_echostr();
    let timestamp = unix_timestamp_secs().to_string();
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let signature = build_callback_signature(token, &timestamp, &nonce);

    let response = client.get(url).query(&[
        ("signature", signature.as_str()),
        ("timestamp", timestamp.as_str()),
        ("nonce", nonce.as_str()),
        ("echostr", echostr.as_str()),
    ]);

    let response = match response.send() {
        Ok(response) => response,
        Err(err) => {
            return HandshakeOutcome {
                ok: false,
                message: format!(
                    "{}：{err}",
                    request_error_reason(&err, "（官方要求 5 秒内应答）")
                ),
            };
        }
    };

    let status = response.status();
    if !status.is_success() {
        return HandshakeOutcome {
            ok: false,
            message: format!("目标返回 HTTP {status}，echostr 握手未通过"),
        };
    }

    let body = response.bytes().unwrap_or_default();
    if body.as_ref() == echostr.as_bytes() {
        HandshakeOutcome {
            ok: true,
            message: "echostr 握手成功：三参 sha1 验签 GET，echostr 原样回显（HTTP 200）".into(),
        }
    } else {
        let echoed = String::from_utf8_lossy(&body).to_string();
        HandshakeOutcome {
            ok: false,
            message: format!("HTTP 200 但回显与 echostr 不一致：{echoed:?}"),
        }
    }
}

/// 公众号直发路由：明文逐字节交 [`push`]，三模式差异（query 参数集、信封）
/// 全部留在 push 模块内部，不对外暴露。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let ConnectionConfig::WechatMp { mode, .. } = config else {
        return DispatchOutcome::not_sent("配置不是微信公众号渠道，无法直发");
    };
    match mode {
        WechatMpMode::Plain => push::dispatch_plain(client, config, plaintext),
        WechatMpMode::Compatible => push::dispatch_compatible(client, config, plaintext),
        WechatMpMode::Secure => push::dispatch_secure(client, config, plaintext),
    }
}

/// 公众号渠道适配器：[`super::ChannelAdapter`] 的公众号实现——
/// GET 三参握手与三模式 XML 直发按连接配置路由；AES 信封复用企微 crypto
/// 同族原语，尾部 AppId 校验等差异留在本渠道模块内。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "wechat-mp"
    }

    fn label(&self) -> &'static str {
        "微信公众号"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::WechatMp { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        let ConnectionConfig::WechatMp { url, .. } = config else {
            return None;
        };
        Some(url)
    }

    fn handshake_client(&self) -> reqwest::blocking::Client {
        // 生产用默认客户端：官方 5 秒应答窗口（超时×3 重试），本地留 5s 上限
        super::client_with_timeout(Duration::from_secs(5))
    }

    fn verify_handshake(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
    ) -> HandshakeOutcome {
        verify_handshake(client, config)
    }

    fn dispatch_event(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
        plaintext: &str,
    ) -> DispatchOutcome {
        dispatch_event(client, config, plaintext)
    }
}

/// 解密加密被动回复并校验尾部 AppId（官方 §4.4：appid 须校验，与企微
/// receiveid 同位）。校验失败返回 None（回执正文仍原样入记录）。
pub(crate) fn decrypt_reply(
    encoding_aes_key: &str,
    encrypt: &str,
    app_id: &str,
) -> Option<String> {
    let decrypted = decrypt_msg(encoding_aes_key, encrypt).ok()?;
    if decrypted.receiveid != app_id {
        return None;
    }
    Some(String::from_utf8_lossy(&decrypted.msg).to_string())
}
