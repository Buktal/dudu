//! 微信公众号渠道（事实库 docs/research/channels/wechat-mp.md）：
//! GET 三参握手（[`build_callback_signature`] 验签 + 原样回 echostr）+
//! POST XML 三模式直发（[`push`]，明文/兼容/安全，按连接配置的
//! [`WechatMpMode`] 路由）。报文仅 XML（事实库 §2 公共约束）；
//! 加解密复用企微同族 AES 原语（`wecom::crypto`，同一套 32 字节 PKCS#7），
//! 明文尾部为 AppId 且解密后须校验（receiveid=appId）——与小程序共族的
//! 直发骨架单点在 wechat_common，回执仅 XML 信封等差异留在 [`push`]。
//!
//! 三模式（事实库 §4.1）：
//! - 明文（官方默认）：明文 XML 直发，URL 仅三参 signature
//! - 兼容（调试过渡）：明文与密文并存，URL 加 encrypt_type=aes + msg_signature
//! - 安全（官方推荐）：仅密文信封（ToUserName + Encrypt），URL 同兼容

mod push;

#[cfg(test)]
mod tests;

// 微信族共享原语单点在 wechat_common（GET 握手的三参签名已在握手构造骨架
// handshake_echo_get 内装订，本 re-export 供 tests 黄金对拍取用；POST 直发
// 骨架由 [`push`] 消费族共享 dispatcher）。
pub(crate) use crate::connections::util::now_secs;
#[cfg(test)]
pub(crate) use crate::connections::wechat_common::build_callback_signature;

use super::adapter::narrow;
use super::{
    handshake_echo_get, ConnectionConfig, DispatchOutcome, HandshakeOutcome, WechatMpMode,
};

/// echostr 握手的随机明文：32 位 hex（官方仅要求原样回显，无内容约束）。
fn random_echostr() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// GET 首次校验握手（事实库 §3.2 三步）：生成随机 echostr → 三参字典序签名 →
/// GET 目标 URL（signature/timestamp/nonce/echostr）→ 期望 HTTP 200 且响应体
/// 与 echostr 逐字节一致（官方要求原样返回、不加引号）。
/// 超时窗口：官方 5 秒应答窗口（超时×3 重试），本地留 5s 上限（trait 默认
/// 握手客户端）。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    url: &str,
    token: &str,
) -> HandshakeOutcome {
    let echostr = random_echostr();
    let timestamp = now_secs().to_string();
    let nonce = uuid::Uuid::new_v4().simple().to_string();

    handshake_echo_get(
        client,
        url,
        echostr,
        timestamp,
        nonce,
        token,
        "（官方要求 5 秒内应答）",
        "echostr 握手成功：三参 sha1 验签 GET，echostr 原样回显（HTTP 200）",
        "回显与 echostr 不一致",
    )
}

/// 公众号直发路由：明文逐字节交 [`push`]，三模式差异（query 参数集、信封）
/// 全部留在 push 模块内部，不对外暴露。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    url: &str,
    mode: &WechatMpMode,
    token: &str,
    app_id: &str,
    encoding_aes_key: &str,
    plaintext: &str,
) -> DispatchOutcome {
    match mode {
        WechatMpMode::Plain => {
            push::dispatch_plain(client, url, token, app_id, encoding_aes_key, plaintext)
        }
        WechatMpMode::Compatible => {
            push::dispatch_compatible(client, url, token, app_id, encoding_aes_key, plaintext)
        }
        WechatMpMode::Secure => {
            push::dispatch_secure(client, url, token, app_id, encoding_aes_key, plaintext)
        }
    }
}

/// 公众号渠道适配器：[`super::ChannelAdapter`] 的公众号实现——
/// GET 三参握手与三模式 XML 直发按连接配置路由；AES 信封复用企微 crypto
/// 同族原语，尾部 AppId 校验在族共享直发骨架（wechat_common）内。
/// 宽配置 → 渠道字段收窄经 `narrow!` 单点（super::adapter）。
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

    fn url<'a>(&self, config: &'a ConnectionConfig) -> &'a str {
        narrow!(config, WechatMp { url } => url.as_str())
    }

    fn verify_handshake(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
    ) -> HandshakeOutcome {
        narrow!(config, WechatMp { url, token } =>
            verify_handshake(client, url, token))
    }

    fn dispatch_event(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
        plaintext: &str,
    ) -> DispatchOutcome {
        narrow!(config, WechatMp { url, mode, token, app_id, encoding_aes_key } =>
            dispatch_event(client, url, mode, token, app_id, encoding_aes_key, plaintext))
    }
}
