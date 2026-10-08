//! 抖音渠道：四套推送体系共用一个 [`Adapter`]，按连接配置的 [`DouyinSystem`]
//! 路由到各体系协议模块（事实库 §2：验签与载荷完全不同）：
//! - dop / 生活服务：verify_webhook challenge 握手（[`challenge`]，官方「同款」）+
//!   X-Douyin-Signature 直发（[`sha1_push`]：dop=sha1(client_secret+body)、
//!   生活服务=sha1(AppSecret+去换行 body)）
//! - 小游戏：verify_request 握手 + x-signature 直发（[`minigame`]）
//! - 服务商：授权推送形态握手（目标回 success）+ 加密信封直发（[`isv`]）

mod challenge;
mod isv;
mod minigame;
mod sha1_push;

// dop 签名原语的测试引用点（执行器测试按渠道名取用，与线上一致）
#[cfg(test)]
pub(crate) use sha1_push::sign_dop as sign;

use super::adapter::narrow;
use super::{ConnectionConfig, DispatchOutcome, DouyinSystem, HandshakeOutcome};

/// 抖音体系握手路由：dop/生活服务共用 verify_webhook challenge（官方同款，
/// 差异只在签名算法与应答窗口提示）；小游戏与服务商各有独立握手形态。
/// 超时窗口：抖音连接超过 5s 自动断开（dop 官方窗口），本地留 5s 上限（trait
/// 默认握手客户端）；生活服务 2.5s 更严但由提示与期望回执表达。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    url: &str,
    system: &DouyinSystem,
    client_key: &str,
    client_secret: &str,
    mini_game_token: &str,
    isv_token: &str,
) -> HandshakeOutcome {
    match system {
        DouyinSystem::Dop => {
            challenge::verify_handshake(client, url, client_key, client_secret, sha1_push::sign_dop, "")
        }
        DouyinSystem::LifeService => challenge::verify_handshake(
            client,
            url,
            client_key,
            client_secret,
            sha1_push::sign_life,
            "（官方要求 2.5 秒内应答）",
        ),
        DouyinSystem::MiniGame => minigame::verify_handshake(client, url, client_key, mini_game_token),
        DouyinSystem::Isv => isv::verify_handshake(client, url, isv_token),
    }
}

/// 抖音体系直发路由：body 是前端逐字节拼装的明文，各体系只算签名/构信封
/// 与头集合不同，字节透传原则一致（服务商信封为唯一例外，见 isv 模块说明）。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
// 协议路由显式收全渠道字段（URL/通道/凭证/明文各就各位），不为压参数量引入包装对象
#[allow(clippy::too_many_arguments)]
fn dispatch_event(
    client: &reqwest::blocking::Client,
    url: &str,
    system: &DouyinSystem,
    client_key: &str,
    client_secret: &str,
    mini_game_token: &str,
    isv_token: &str,
    body: &str,
) -> DispatchOutcome {
    match system {
        DouyinSystem::Dop => sha1_push::dispatch(
            client,
            url,
            body,
            sha1_push::sign_dop(client_secret, body),
            "",
        ),
        DouyinSystem::LifeService => sha1_push::dispatch(
            client,
            url,
            body,
            sha1_push::sign_life(client_secret, body),
            "（官方要求 2.5 秒内应答）",
        ),
        DouyinSystem::MiniGame => {
            minigame::dispatch(client, url, body, client_key, mini_game_token)
        }
        DouyinSystem::Isv => isv::dispatch(client, url, body, isv_token),
    }
}

/// 抖音渠道适配器：[`super::ChannelAdapter`] 的抖音实现——
/// 四套体系的签名/信封/头构造全部复用各体系模块的协议原语，不对外暴露。
/// 宽配置 → 渠道字段收窄经 `narrow!` 单点（super::adapter）。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "douyin"
    }

    fn label(&self) -> &'static str {
        "抖音"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::Douyin { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        narrow!(config, Douyin { url } => Some(url.as_str()))
    }

    fn verify_handshake(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
    ) -> HandshakeOutcome {
        narrow!(config, Douyin { url, system, client_key, client_secret, mini_game_token, isv_token } =>
            verify_handshake(client, url, system, client_key, client_secret, mini_game_token, isv_token))
    }

    fn dispatch_event(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
        body: &str,
    ) -> DispatchOutcome {
        narrow!(config, Douyin { url, system, client_key, client_secret, mini_game_token, isv_token } =>
            dispatch_event(client, url, system, client_key, client_secret, mini_game_token, isv_token, body))
    }
}
