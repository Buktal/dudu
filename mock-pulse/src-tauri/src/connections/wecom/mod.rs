//! 企业微信渠道：GET echostr 握手 + 加密信封直发 + [`Adapter`]。
//! 官方加解密栈（AES 信封 / PKCS#7-32 / 四值签名）单点在 [`crypto`]，
//! 握手与直发只消费其原语；对外只经 [`super::ChannelAdapter`] 路由。
//! 两条推送通道并行（事实库 §2.1/§2.10），按连接配置的 [`WecomSystem`] 路由：
//! - [`agent`] 自建应用：明文 XML 报文，加密 receiveid = corpId（官方 90239/90240）
//! - [`aibot`] 智能机器人：明文 JSON 报文，加密 receiveid = 空串（官方 101033）

mod aibot;
mod agent;

pub(crate) mod crypto;

// 加解密原语在 wecom 域内平铺可取（既有调用方 wecom::encrypt_msg 等路径不变）。
pub(crate) use crypto::{build_signature, decrypt_msg, encrypt_msg};

use std::time::Duration;

use crate::connections::util::now_secs;

use super::{handshake_echo_outcome, ConnectionConfig, DispatchOutcome, HandshakeOutcome, WecomSystem};

/// 16 字节随机数：复用 uuid v4（已在依赖内），一个 v4 即 16 随机字节。
pub(super) fn random_16() -> [u8; 16] {
    *uuid::Uuid::new_v4().as_bytes()
}

/// echostr 握手的随机明文：32 位 hex（可打印、无引号换行，官方仅要求原样回显）。
fn random_plaintext() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// 两通道共用的 GET echostr 握手（官方 §3.2 流程相同，receiveid 语义不同）：
/// 生成随机明文 → 加密成 echostr → 四值字典序签名 → GET 目标 URL →
/// 期望 HTTP 200 且响应体与明文逐字节一致（无引号/无 BOM/无换行即逐字节相等）。
/// 私有协议原语：仅 agent/aibot 两通道模块取用。
fn echo_handshake(
    client: &reqwest::blocking::Client,
    url: &str,
    token: &str,
    encoding_aes_key: &str,
    receiveid: &str,
) -> HandshakeOutcome {
    let plaintext = random_plaintext();
    let echostr = match encrypt_msg(encoding_aes_key, &random_16(), plaintext.as_bytes(), receiveid)
    {
        Ok(value) => value,
        Err(reason) => {
            return HandshakeOutcome {
                ok: false,
                message: reason,
            }
        }
    };
    let timestamp = now_secs().to_string();
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let signature = build_signature(token, &timestamp, &nonce, &echostr);

    let response = client
        .get(url)
        .query(&[
            ("msg_signature", signature.as_str()),
            ("timestamp", timestamp.as_str()),
            ("nonce", nonce.as_str()),
            ("echostr", echostr.as_str()),
        ])
        .send();

    handshake_echo_outcome(
        response,
        plaintext.as_bytes(),
        "（官方要求 1 秒内应答）",
        "echostr 握手成功：随机明文经 AES 加密签名 GET，解密明文原样回显（HTTP 200）",
        "回显与解密明文不一致",
    )
}

/// 企微通道握手路由：XML 与机器人通道同走 GET echostr 流程，差异只在
/// 加密 receiveid（自建应用=corpId，机器人=空串）。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let ConnectionConfig::Wecom {
        url,
        corp_id,
        token,
        encoding_aes_key,
        system,
        ..
    } = config
    else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是企业微信渠道，无法执行 echostr 握手".into(),
        };
    };
    match system {
        WecomSystem::Agent => echo_handshake(client, url, token, encoding_aes_key, corp_id),
        // 官方 §4.4/101033：企业自建智能机器人 receiveid 直接传空字符串
        WecomSystem::Aibot => echo_handshake(client, url, token, encoding_aes_key, ""),
    }
}

/// 企微通道直发路由：明文逐字节加密进信封，通道差异留在各通道模块内部
/// （自建应用 XML 信封 text/xml / 机器人 JSON 信封 application/json）。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let ConnectionConfig::Wecom { system, .. } = config else {
        return DispatchOutcome::not_sent("配置不是企业微信渠道，无法直发");
    };
    match system {
        WecomSystem::Agent => agent::dispatch_event(client, config, plaintext),
        WecomSystem::Aibot => aibot::dispatch_event(client, config, plaintext),
    }
}

/// 企微渠道适配器：[`super::ChannelAdapter`] 的企微实现——
/// AES 信封/四值签名/被动回复解密全部复用 crypto 的协议原语，
/// XML 与机器人两通道的报文差异按配置路由到各自模块，不对外暴露。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "wecom"
    }

    fn label(&self) -> &'static str {
        "企业微信"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::Wecom { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        let ConnectionConfig::Wecom { url, .. } = config else {
            return None;
        };
        Some(url)
    }

    fn handshake_client(&self) -> reqwest::blocking::Client {
        // 生产用默认客户端：官方要求 echostr 1 秒内响应，本地留 1s 上限
        super::client_with_timeout(Duration::from_secs(1))
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

#[cfg(test)]
mod tests;
