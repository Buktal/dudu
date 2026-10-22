//! 微信小程序渠道（事实库 docs/research/channels/wechat-mini.md）：
//! GET 三参握手与公众号同族（[`build_callback_signature`] 验签 + 原样回
//! echostr，官方算例 f464b24…）+ POST 报文三模式直发（[`push`]，明文/兼容/
//! 安全，按连接配置的 [`WechatMiniMode`] 路由）。
//!
//! 与公众号（wechat_mp）的差异全部留在本模块内（ADR-0001）：
//! - 数据格式：官方控制台 XML/JSON 可选（事实库 §3.1），双格式按事实库结论
//!   **取 XML 为主**——模板与直发报文均为 XML；数据格式项随连接记录目标侧形态
//! - 安全模式收包信封：官方仅给 JSON 样例（事实库 §7.7 待核验），XML 按公众号
//!   同族（ToUserName + Encrypt 同名两字段）实现
//! - 回执解析：XML 与 JSON 加密回包信封双形态（JSON 信封为事实库 §5.6 逐字
//!   官方样本；回 `success`/空串免加密语义不变）
//! - 加密回包信封 Nonce 官方示例**复用请求 URL 的 nonce**（事实库 §3.4），
//!   mock 直发的请求 nonce 即快照 msg_id，目标按官方示例回包即同形
//! - AES 同企微族（`wecom::crypto`）：明文尾部为 AppId 且解密后须校验
//!   （事实库 §4.3「appid 须校验与本小程序一致」）

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
    handshake_echo_get, ConnectionConfig, DispatchOutcome, HandshakeOutcome, WechatMiniMode,
};

/// echostr 握手的随机明文：32 位 hex（官方仅要求原样回显，无内容约束）。
fn random_echostr() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// GET 首次校验握手（事实库 §3.2）：生成随机 echostr → 三参字典序签名 →
/// GET 目标 URL（signature/timestamp/nonce/echostr）→ 期望 HTTP 200 且响应体
/// 与 echostr 逐字节一致（官方要求原样返回、不加引号）。
/// 超时窗口：官方 5 秒应答窗口（重试规则小程序侧待核验，mock 按同体系实现），
/// 本地留 5s 上限（trait 默认握手客户端）。
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

/// 小程序直发路由：明文逐字节交 [`push`]，三模式差异（query 参数集、信封）
/// 全部留在 push 模块内部，不对外暴露。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    url: &str,
    mode: &WechatMiniMode,
    token: &str,
    app_id: &str,
    encoding_aes_key: &str,
    plaintext: &str,
) -> DispatchOutcome {
    match mode {
        WechatMiniMode::Plain => {
            push::dispatch_plain(client, url, token, app_id, encoding_aes_key, plaintext)
        }
        WechatMiniMode::Compatible => {
            push::dispatch_compatible(client, url, token, app_id, encoding_aes_key, plaintext)
        }
        WechatMiniMode::Secure => {
            push::dispatch_secure(client, url, token, app_id, encoding_aes_key, plaintext)
        }
    }
}

/// 小程序渠道适配器：[`super::ChannelAdapter`] 的小程序实现——
/// GET 三参握手（同公众号）与三模式 XML 直发按连接配置路由；数据格式取
/// XML 为主（事实库结论），AES 信封复用企微 crypto 同族原语，尾部 AppId
/// 校验在族共享直发骨架（wechat_common）内。
/// 宽配置 → 渠道字段收窄经 `narrow!` 单点（super::adapter）。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "wechat-mini"
    }

    fn label(&self) -> &'static str {
        "微信小程序"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::WechatMini { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> &'a str {
        narrow!(config, WechatMini { url } => url.as_str())
    }

    fn verify_handshake(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
    ) -> HandshakeOutcome {
        narrow!(config, WechatMini { url, token } =>
            verify_handshake(client, url, token))
    }

    fn dispatch_event(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
        plaintext: &str,
    ) -> DispatchOutcome {
        narrow!(config, WechatMini { url, mode, token, app_id, encoding_aes_key } =>
            dispatch_event(client, url, mode, token, app_id, encoding_aes_key, plaintext))
    }
}
