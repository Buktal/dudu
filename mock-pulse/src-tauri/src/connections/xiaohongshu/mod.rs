//! 小红书渠道（事实库 docs/research/channels/xiaohongshu.md，双体系并行，
//! 按 [`ConnectionConfig::Xiaohongshu`] 的 system 通道路由）：
//! - 小程序客服消息（§10 [官方]，官方消息型推送基准）：GET 四参握手
//!   （[`build_callback_signature`] 三参 sha1 排序验签 + 原样回 echostr）+
//!   POST 加密信封直发（[`dispatch_event`]：信封 {Nonce,Timestamp,Encrypt,
//!   MsgSignature} 在 body 内，§11.2；回 success，5s 超时×3 重试 §10.5）
//! - 电商 ark 推送（§2 [多源]）：POST JSON 数组明文直发，见 [`ark`]
//!
//! 与其他渠道的差异全部留在本模块内（ADR-0001）：
//! - 握手（§10.4）：GET 带 signature/timestamp/nonce/echostr 四 query 参数，
//!   signature = sha1(字典序排序(token, timestamp, nonce) 后拼接)——与微信
//!   三参家族同式；通过则目标原样返回 echostr
//! - AES（§11.3 官方 MsgDecrypt.zip 源码实锤，与微信族同算法）：AESKey =
//!   Base64Decode(EncodingAESKey + "=")、AES-256-CBC、IV = key 前 16B、
//!   PKCS#7 以 32 字节补位、明文结构 random(16B) + msg_len(4B 大端) + msg +
//!   appId——原语直接复用企微同族实现（`wecom::crypto`），receiveid 用
//!   AppId 且解密后须校验
//! - MsgSignature（§11.3）：sha1(字典序排序(token, timestamp, nonce, encrypt)
//!   四值拼接) 40 位小写 hex，与企微 msg_signature 同族
//! - 信封在 body 内（§11.2 与企微自建应用的 query 参数不同点）：
//!   `{"Nonce","Timestamp","Encrypt","MsgSignature"}`，Timestamp 为数字（i32）

mod ark;

#[cfg(test)]
mod tests;

use std::time::Duration;

use crate::connections::util::{callback_signature as build_callback_signature, now_secs};
use crate::connections::wecom::crypto;

use super::{
    handshake_echo_outcome, send_measured, ConnectionConfig, DispatchOutcome, HandshakeOutcome,
    XiaohongshuSystem,
};

/// 官方应答窗口（§10.5 镜像）：5 秒内未收到响应即断开重发，总共重试 3 次。
const RESPONSE_WINDOW_NOTE: &str = "（官方 5 秒内无响应即断开重试，共 3 次）";

/// 随机 nonce：32 位 hex（小程序语境与微信同族，官方未给样本形态）。
fn random_nonce() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// GET 握手的随机 echostr：32 位 hex（官方仅要求原样回显，无内容约束）。
fn random_echostr() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

/// 推送 MsgSignature 四参签名（§11.3 官方 MsgSignature.getSignature 逐字）：
/// sha1(字典序排序(token, timestamp, nonce, encrypt) 后拼接)，与企微
/// msg_signature 同族（原语复用 wecom::crypto）。
pub(crate) fn build_msg_signature(token: &str, timestamp: &str, nonce: &str, encrypt: &str) -> String {
    crypto::build_signature(token, timestamp, nonce, encrypt)
}

/// 从小红书连接配置取小程序通道字段；非小红书配置或 ark 通道返回 None。
fn miniapp_fields(config: &ConnectionConfig) -> Option<(&str, &str, &str, &str)> {
    let ConnectionConfig::Xiaohongshu {
        url,
        system,
        token,
        encoding_aes_key,
        app_id,
    } = config
    else {
        return None;
    };
    if *system != XiaohongshuSystem::Miniapp {
        return None;
    }
    Some((url, token, encoding_aes_key, app_id))
}

/// GET 首次校验握手（§10.4）：生成随机 echostr/nonce → 三参字典序签名 →
/// GET 目标 URL（四 query 参数）→ 期望 HTTP 200 且响应体与 echostr 逐字节
/// 一致（官方要求原样返回 echostr，接入生效）。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let ConnectionConfig::Xiaohongshu { url, token, system, .. } = config else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是小红书渠道，无法执行 GET 握手".into(),
        };
    };
    if *system == XiaohongshuSystem::Ark {
        return ark::probe_handshake(client, config);
    }
    let echostr = random_echostr();
    let timestamp = now_secs().to_string();
    let nonce = random_nonce();
    let signature = build_callback_signature(token, &timestamp, &nonce);

    let response = client.get(url).query(&[
        ("signature", signature.as_str()),
        ("timestamp", timestamp.as_str()),
        ("nonce", nonce.as_str()),
        ("echostr", echostr.as_str()),
    ]);

    handshake_echo_outcome(
        response.send(),
        echostr.as_bytes(),
        RESPONSE_WINDOW_NOTE,
        "echostr 握手成功：三参 sha1 验签 GET，echostr 原样回显（HTTP 200）",
        "回显与 echostr 不一致",
    )
}

/// 构造一次小程序通道加密推送的全部要素：明文 → 加密信封 body（签名在内）。
struct CryptoPush {
    body: String,
    signature: String,
    timestamp: String,
    nonce: String,
}

/// 组装加密信封（§11.2/§11.3）：随机 16B 加密（receiveid = AppId）→ sha1
/// 四参 MsgSignature → 信封四字段按官方字段表序（Timestamp 为数字）。
fn build_crypto_push(
    plaintext: &str,
    token: &str,
    encoding_aes_key: &str,
    app_id: &str,
) -> Result<CryptoPush, String> {
    let encrypt = crypto::encrypt_msg(encoding_aes_key, &random16(), plaintext.as_bytes(), app_id)?;
    let timestamp = now_secs().to_string();
    let nonce = random_nonce();
    let signature = build_msg_signature(token, &timestamp, &nonce, &encrypt);
    let body = serde_json::json!({
        "Nonce": nonce,
        "Timestamp": timestamp.parse::<i64>().unwrap_or(0),
        "Encrypt": encrypt,
        "MsgSignature": signature,
    })
    .to_string();
    Ok(CryptoPush { body, signature, timestamp, nonce })
}

/// 随机 16B：uuid v4 字节（依赖内已有的随机源，不额外引随机库）。
fn random16() -> [u8; 16] {
    *uuid::Uuid::new_v4().as_bytes()
}

/// 小红书直发：小程序加密信封 / ark 数组明文按通道路由，明文由前端逐字节
/// 拼装，本模块只做协议封装不重排（ADR-0001）。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    if matches!(
        config,
        ConnectionConfig::Xiaohongshu { system: XiaohongshuSystem::Ark, .. }
    ) {
        return ark::dispatch_event(client, config, plaintext);
    }
    miniapp_dispatch(client, config, plaintext)
}

/// 小程序通道直发（§10.3/§11.2）：明文 JSON 逐字节加密进信封 body，POST 目标
/// URL（无 URL 签名，签名在 body 的 MsgSignature 字段内）；应答期望为明文
/// `success`（§10.5），无需解密，回执正文原样记录。
fn miniapp_dispatch(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let Some((url, token, encoding_aes_key, app_id)) = miniapp_fields(config) else {
        return DispatchOutcome::not_sent("配置不是小红书小程序通道，无法直发");
    };
    let push = match build_crypto_push(plaintext, token, encoding_aes_key, app_id) {
        Ok(push) => push,
        Err(reason) => return DispatchOutcome::not_sent(format!("事件加密封装失败：{reason}")),
    };
    let (status, receipt, error, elapsed_ms) = send_measured(
        client
        .post(url)
        .header("Content-Type", "application/json")
        .body(push.body.clone()),
        "",
    );
    DispatchOutcome {
        msg_id: push.nonce,
        signature: push.signature,
        timestamp: Some(push.timestamp),
        request_body: Some(push.body),
        reply: None,
        status,
        elapsed_ms,
        body: receipt,
        error,
    }
}

/// 小红书渠道适配器：[`super::ChannelAdapter`] 的小红书实现——GET 四参握手与
/// 加密信封/ark 数组双通道直发按连接配置路由；AES 原语复用企微同族
/// （`wecom::crypto`，官方 MsgDecrypt 与微信同族），差异不外溢。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "xiaohongshu"
    }

    fn label(&self) -> &'static str {
        "小红书"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::Xiaohongshu { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        let ConnectionConfig::Xiaohongshu { url, .. } = config else {
            return None;
        };
        Some(url)
    }

    fn handshake_client(&self) -> reqwest::blocking::Client {
        // 生产用默认客户端：小程序通道官方 5 秒应答窗口（超时断开×3 重试）
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
