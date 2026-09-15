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

use std::time::Duration;

// 微信族共享原语单点在 wechat_common（本模块 GET 握手与 tests 经 re-export
// 取用；POST 直发骨架由 [`push`] 消费族共享 dispatcher）。
pub(crate) use crate::connections::wechat_common::{build_callback_signature, unix_timestamp_secs};

use super::{
    request_error_reason, ConnectionConfig, DispatchOutcome, HandshakeOutcome, WechatMiniMode,
};

/// echostr 握手的随机明文：32 位 hex（官方仅要求原样回显，无内容约束）。
fn random_echostr() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// GET 首次校验握手（事实库 §3.2）：生成随机 echostr → 三参字典序签名 →
/// GET 目标 URL（signature/timestamp/nonce/echostr）→ 期望 HTTP 200 且响应体
/// 与 echostr 逐字节一致（官方要求原样返回、不加引号）。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let ConnectionConfig::WechatMini { url, token, .. } = config else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是微信小程序渠道，无法执行 GET 握手".into(),
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

/// 小程序直发路由：明文逐字节交 [`push`]，三模式差异（query 参数集、信封）
/// 全部留在 push 模块内部，不对外暴露。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let ConnectionConfig::WechatMini { mode, .. } = config else {
        return DispatchOutcome::not_sent("配置不是微信小程序渠道，无法直发");
    };
    match mode {
        WechatMiniMode::Plain => push::dispatch_plain(client, config, plaintext),
        WechatMiniMode::Compatible => push::dispatch_compatible(client, config, plaintext),
        WechatMiniMode::Secure => push::dispatch_secure(client, config, plaintext),
    }
}

/// 小程序渠道适配器：[`super::ChannelAdapter`] 的小程序实现——
/// GET 三参握手（同公众号）与三模式 XML 直发按连接配置路由；数据格式取
/// XML 为主（事实库结论），AES 信封复用企微 crypto 同族原语，尾部 AppId
/// 校验在族共享直发骨架（wechat_common）内。
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

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        let ConnectionConfig::WechatMini { url, .. } = config else {
            return None;
        };
        Some(url)
    }

    fn handshake_client(&self) -> reqwest::blocking::Client {
        // 生产用默认客户端：官方 5 秒应答窗口（重试规则小程序侧待核验，
        // mock 按同体系实现），本地留 5s 上限
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
