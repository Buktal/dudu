//! 淘宝渠道（全球栈 HTTPS 回调子形态，事实库 docs/research/channels/taobao.md
//! §3.2/§4.2/§5.6；国内 TOP 无 HTTP 回调，TMC 长连接不在范围）：
//! 明文 JSON 推送 + 头 `Authorization` 验签（数据明文传输，无 AES），
//! 成功判定恒为「HTTP 200 确认签收」，失败半小时后重试、最多 12 次。
//!
//! 与其他渠道的差异全部留在本模块内（ADR-0001）：
//! - 验签（§4.2 逐字）：「使用 AppKey 拼接请求 Body 作为消息体，以 AppSecret
//!   作为密钥，签名加密算法为 HMAC-SHA256」——Authorization =
//!   HEX_ENCODE(HMAC-SHA256(AppKey + message_body, AppSecret))，官方 Java 示例
//!   逐字节 %02x 拼接后 toLowerCase（64 位小写 hex）
//! - 握手（§3.2 配置页）：控制台填回调地址后点 Verify，「返回 HTTP 200 即验证
//!   成功」；验证请求体官方未披露 → 以 §5.6 正向样本明文 + 合规签名头作探针
//! - 直发（§3.2/§5.6）：POST 明文 JSON（逐字节透传不重排）+ Authorization 头；
//!   「请勿在收到消息的同时进行业务处理」，收到即签收由目标侧自行保证
//! - 应答（§3.2 逐字）：「收到消息后请返回 HTTP 200 状态码，确认签收消息」；
//!   「超过 500ms 服务端未收到 200 确认，服务端则认为消息推送失败；失败后消息
//!   会在半个小时后重试推送，最大重试 12 次」

#[cfg(test)]
mod tests;

use crate::connections::util::hmac_sha256_hex;

use super::adapter::narrow;
use super::{
    no_body_check, no_reply, probe_handshake_outcome, send_measured_outcome, ConnectionConfig,
    DispatchOutcome, DispatchSnapshot, HandshakeOutcome,
};

/// 失败重试口径（§3.2 逐字）：超 500ms 未收到 200 即推送失败，半小时后重试、
/// 最多 12 次；超时文案附该语义。
const RETRY_NOTE: &str = "（官方 500ms 内未收到 HTTP 200 即视为推送失败：半小时后重试，最多 12 次）";

/// 官方正向样本明文（§5.6 逐字，键序同官方文档）：Verify 握手探针复用该样本
/// （官方未披露验证请求体，以带合规签名头的官方样本明文作探针，语义同普通推送）。
pub(crate) const GOLDEN_FORWARD_PLAINTEXT: &str = concat!(
    r#"{"seller_id":"1234567","message_type":0,"data":{"order_status":"unpaid","#,
    r#""trade_order_id":"260422900198363","trade_order_line_id":"260422900298363","#,
    r#""status_update_time":1603698638},"timestamp":1603766859530,"site":"lazada_vn"}"#
);

/// 淘宝全球栈回调验签（事实库 §4.2 逐字）：消息体 = AppKey 拼接请求 Body，
/// 密钥 = AppSecret，HMAC-SHA256 → 64 位小写 hex。
pub(crate) fn authorization(body: &str, app_key: &str, app_secret: &str) -> String {
    hmac_sha256_hex(app_secret, &format!("{app_key}{body}"))
}

/// 从明文 JSON 提取业务幂等键快照：refund_id（退款，退款单自身标识）→
/// tid（交易）→ msg_id（OpenIM）→ data.trade_order_id / data.reverse_order_id
/// （全球栈信封）；均缺失不落值（事实库 §3.3 幂等键口径）。
fn message_id_of(body: &str) -> String {
    let parsed = serde_json::from_str::<serde_json::Value>(body).ok();
    for key in ["refund_id", "tid", "msg_id"] {
        if let Some(value) = parsed
            .as_ref()
            .and_then(|value| value.get(key))
            .and_then(|value| value.as_str())
        {
            return value.to_string();
        }
    }
    for key in ["trade_order_id", "reverse_order_id"] {
        if let Some(value) = parsed
            .as_ref()
            .and_then(|value| value.get("data"))
            .and_then(|data| data.get(key))
            .and_then(|value| value.as_str())
        {
            return value.to_string();
        }
    }
    String::new()
}

/// POST 明文 JSON + Authorization 头：body 逐字节透传不重排（ADR-0001），
/// 签名按原始 body 字节与 AppKey 前缀计算；幂等键快照取载荷业务 ID。
fn post_json(
    client: &reqwest::blocking::Client,
    url: &str,
    app_key: &str,
    app_secret: &str,
    body: &str,
) -> DispatchOutcome {
    let signature = authorization(body, app_key, app_secret);
    send_measured_outcome(
        client
        .post(url)
        .header("Authorization", signature.clone())
        .header("Content-Type", "application/json")
        .body(body.to_string()),
        RETRY_NOTE,
        DispatchSnapshot {
            msg_id: message_id_of(body),
            signature,
            timestamp: None,
            request_body: Some(body.to_string()),
        },
        no_reply,
    )
}

/// 连接测试（§3.2 配置页 Verify 握手）：官方流程为「填回调地址 → Verify →
/// 返回 HTTP 200 即验证成功」。验证请求体官方未披露，探针即官方正向样本明文，
/// 附合规 Authorization 签名头（语义同普通推送），期望 HTTP 200（正文无口径）。
/// 超时窗口：官方签收窗口 500ms 由目标侧保证，本地沿用 5 秒上限（trait 默认
/// 握手客户端）。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    url: &str,
    app_key: &str,
    app_secret: &str,
) -> HandshakeOutcome {
    let outcome = post_json(client, url, app_key, app_secret, GOLDEN_FORWARD_PLAINTEXT);
    probe_handshake_outcome(
        outcome,
        RETRY_NOTE,
        "Verify 验证",
        "官方：返回 HTTP 200 即验证成功",
        "Verify 验证成功：Authorization 签名 POST 被接受，目标返回 HTTP 200 确认签收",
        // 正文无官方口径，成功只判 HTTP 200
        no_body_check,
    )
}

/// 淘宝直发（§3.2/§5.6）：明文 JSON 逐字节透传 + Authorization 头。明文由前端
/// 逐字节拼装，不重排（ADR-0001）；「收到消息返回 HTTP 200 即签收」的应答
/// 语义由前端期望回执（200/正文不校验）承载。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    url: &str,
    app_key: &str,
    app_secret: &str,
    plaintext: &str,
) -> DispatchOutcome {
    post_json(client, url, app_key, app_secret, plaintext)
}

/// 淘宝渠道适配器：[`super::ChannelAdapter`] 的淘宝实现——Verify 验证握手与
/// Authorization（HMAC-SHA256）签名直发；原语复用 util（hmac_sha256_hex），
/// 差异不外溢。宽配置 → 渠道字段收窄经 `narrow!` 单点（super::adapter）。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "taobao"
    }

    fn label(&self) -> &'static str {
        "淘宝"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::Taobao { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        narrow!(config, Taobao { url } => Some(url.as_str()))
    }

    fn verify_handshake(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
    ) -> HandshakeOutcome {
        narrow!(config, Taobao { url, app_key, app_secret } =>
            verify_handshake(client, url, app_key, app_secret))
    }

    fn dispatch_event(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
        plaintext: &str,
    ) -> DispatchOutcome {
        narrow!(config, Taobao { url, app_key, app_secret } =>
            dispatch_event(client, url, app_key, app_secret, plaintext))
    }
}
