//! 微博渠道（事实库 docs/research/channels/weibo.md，粉丝服务平台 Webhook，
//! JSON 默认格式；XML 双轨经 set_format 切换，本工具取 JSON 主形态）：
//! GET 四参握手（[`build_callback_signature`] 排序验签 + 原样回 echostr）+
//! JSON 事件直发（[`dispatch_event`]，URL 附 signature/timestamp/nonce 继续验签）。
//!
//! 与其他渠道的差异全部留在本模块内（ADR-0001）：
//! - 验签（§4.1）：sha1(字典序排序(appsecret, timestamp, nonce) 后拼接)，三参
//!   家族（无 msg_encrypt/echostr 入签），密钥是 APPKEY 对应的 App Secret
//!   （官方明示「非自定义 Token」，与微信差异点）；无消息体加密（事实库 §4.2）
//! - 握手（§3.1）：GET 带 signature/timestamp/nonce/echostr，通过则原样返回
//!   echostr；黄金算例 xyz123xyz → 90e4c22c…（锚定 [`tests::golden`]）
//! - 直发（§3.2/附速查）：POST JSON 载荷（receiver_id/sender_id 为 int64 数字
//!   UID，created_at 为 `Mon Jul 16 18:09:20 +0800 2012` 字符串），每次推送
//!   同样携带三参签名；幂等键 sender_id + created_at 由接收侧解析（官方无消息 ID）
//! - 应答（§3.3）：5 秒内应答即可（超时×3 重试）；回空串 = 官方语义「不处理、
//!   不重试」，故正常回执只看状态码、正文不设口径

#[cfg(test)]
mod tests;

use std::time::Duration;

use crate::connections::util::{callback_signature as build_callback_signature, now_millis};

use super::{
    handshake_echo_outcome, send_measured, ConnectionConfig, DispatchOutcome, HandshakeOutcome,
};

/// 握手 nonce：8 位数字（官方算例 nonce=57155157 同形态）——rand Uniform
/// 均匀采样（原 uuid 字节 `% 10` 有模偏差，同 Alphanumeric 退件口径）。
fn random_nonce() -> String {
    use rand::distributions::{Distribution, Uniform};
    let mut rng = rand::thread_rng();
    let digit = Uniform::new(0u8, 10);
    (0..8)
        .map(|_| char::from(b'0' + digit.sample(&mut rng)))
        .collect()
}

/// 官方验证请求样例 echostr `dnPdpTZz85` 为 10 位大小写字母数字混合串：
/// rand Alphanumeric（A-Za-z0-9 恰 62 字符，均匀采样无模偏差）取同形态
/// （官方仅要求原样回显，无内容约束）。
fn random_echostr() -> String {
    use rand::distributions::{Alphanumeric, DistString};
    Alphanumeric.sample_string(&mut rand::thread_rng(), 10)
}

/// GET 首次校验握手（事实库 §3.1 四参）：生成随机 nonce/echostr → 三参字典序
/// 签名 → GET 目标 URL（signature/timestamp/nonce/echostr）→ 期望 HTTP 200 且
/// 响应体与 echostr 逐字节一致（官方要求原样返回）。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let ConnectionConfig::Weibo { url, app_secret } = config else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是微博渠道，无法执行 GET 握手".into(),
        };
    };
    let echostr = random_echostr();
    let timestamp = now_millis().to_string();
    let nonce = random_nonce();
    let signature = build_callback_signature(app_secret, &timestamp, &nonce);

    let response = client.get(url).query(&[
        ("signature", signature.as_str()),
        ("timestamp", timestamp.as_str()),
        ("nonce", nonce.as_str()),
        ("echostr", echostr.as_str()),
    ]);

    handshake_echo_outcome(
        response.send(),
        echostr.as_bytes(),
        "（官方 5 秒内无响应即断开重试）",
        "echostr 握手成功：三参 sha1 验签 GET，echostr 原样回显（HTTP 200）",
        "回显与 echostr 不一致",
    )
}

/// 微博直发（事实库 §3.2/附速查）：JSON 载荷逐字节透传，URL 附
/// signature/timestamp/nonce 三参（每次推送同样验签），body 不重排（ADR-0001）。
/// 官方请求无唯一标识头（幂等键 sender_id+created_at 在接收侧解析），
/// nonce 落 msg_id 快照；回执正文不设口径（回空串 = 官方「不处理不重试」语义）。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let ConnectionConfig::Weibo { url, app_secret } = config else {
        return DispatchOutcome::not_sent("配置不是微博渠道，无法直发");
    };
    let timestamp = now_millis().to_string();
    let nonce = random_nonce();
    let signature = build_callback_signature(app_secret, &timestamp, &nonce);

    let response = client.post(url).query(&[
        ("signature", signature.as_str()),
        ("timestamp", timestamp.as_str()),
        ("nonce", nonce.as_str()),
    ]);
    let (status, receipt, error, elapsed_ms) = send_measured(
        response
        .header("Content-Type", "application/json")
        .body(plaintext.to_string()),
        "",
    );
    DispatchOutcome {
        msg_id: nonce,
        signature,
        timestamp: Some(timestamp),
        request_body: Some(plaintext.to_string()),
        reply: None,
        status,
        elapsed_ms,
        body: receipt,
        error,
    }
}

/// 从微博连接配置取（url, app_secret）；非微博配置 None。
fn weibo_fields(config: &ConnectionConfig) -> Option<(&str, &str)> {
    let ConnectionConfig::Weibo { url, app_secret } = config else {
        return None;
    };
    Some((url, app_secret))
}

/// 微博渠道适配器：[`super::ChannelAdapter`] 的微博实现——GET 四参握手与
/// JSON 签名直发；三参 sha1 排序验签复用 util 同族原语，差异不外溢。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "weibo"
    }

    fn label(&self) -> &'static str {
        "微博"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::Weibo { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        weibo_fields(config).map(|(url, _)| url)
    }

    fn handshake_client(&self) -> reqwest::blocking::Client {
        // 生产用默认客户端：官方 5 秒应答窗口（超时断开×3 重试），本地留 5s 上限
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
