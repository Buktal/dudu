//! Telegram 渠道（Bot Webhook，事实库 docs/research/channels/telegram.md）：
//! HTTPS POST JSON Update 明文（事件体不做应用层加密），恒等头
//! X-Telegram-Bot-Api-Secret-Token 原样回显验证——四渠道对照中唯一无 HMAC/
//! 无签名的（§4.1）；官方无 challenge 式验证握手（setWebhook 同步返回 True
//! 即成功，§3.2），连接测试即合规 Update 样本直发探针（语义同普通推送，
//! 同京东先例）。
//!
//! 与其他渠道的差异全部留在本模块内（ADR-0001）：
//! - 验证（§4.1 逐字）：「the request will contain a header
//!   "X-Telegram-Bot-Api-Secret-Token" with the secret token as content」；
//!   secret_token 1–256 字符、仅 A-Z a-z 0-9 _ -（越限 token 真实 setWebhook
//!   配不出来，本侧直发前拒绝）；安全 = TLS + 头恒等比对 + URL 隐蔽
//! - Update 信封（§2.1）：{update_id: Int, <事件字段其一>: {...}}，任一
//!   Update 至多含一个可选事件字段；update_id 正整数顺序递增（空闲 ≥1 周
//!   后随机），Webhook 下凭它忽略重复/恢复乱序——幂等键快照取它
//! - 探针（§3.2/§5.2）：官方未记述任何验证请求，自测即官方示例 Update
//!   自发 curl——探针 = §5.2 文本消息核验样本逐字 + 合规恒等头
//! - 直发（§附速查）：POST 明文 Update 逐字节透传不重排 + 恒等头；
//!   长轮询 getUpdates 与 Webhook 互斥（24h 暂存语义），端口 443/80/88/8443、
//!   IPv4 only、TLS1.2+ 为服务端（接收方）约束
//! - 应答（§3.3/§附速查）：成功判 2XY；非 2XY「we will repeat the request
//!   and give up after a reasonable amount of attempts」（精确时刻表官方
//!   未公开 → 待核验(09-27)）

#[cfg(test)]
mod tests;

use super::{request_error_reason, ConnectionConfig, DispatchOutcome, HandshakeOutcome};

/// 恒等头名（§4.1 官方拼写逐字）：接收侧按配置的 secret_token 做字符串
/// 相等比较，缺失/不匹配即伪造请求。
const SECRET_TOKEN_HEADER: &str = "X-Telegram-Bot-Api-Secret-Token";

/// 官方 §5.2 文本消息核验样本（webhooks 指南「Testing your bot with updates」
/// 逐字，含原文缩进与 `"type": "private"` 冒号后空格的文档原样）：推送探针
/// 复用该样本（官方无验证握手，自测即自发示例 Update）。
pub(crate) const GOLDEN_PROBE_PLAINTEXT: &str = r#"{
"update_id":10000,
"message":{
    "date":1441645532,
    "chat":{
       "last_name":"Test Lastname",
       "id":1111111,
       "type": "private",
       "first_name":"Test Firstname",
       "username":"Testusername"
    },
    "message_id":1365,
    "from":{
       "last_name":"Test Lastname",
       "id":1111111,
       "first_name":"Test Firstname",
       "username":"Testusername"
    },
    "text":"/start"
}
}"#;

/// 失败重试口径（§3.3 逐字）：非 2XY 状态码即投递失败，「按合理次数重推后
/// 放弃」；精确间隔/次数官方未公开 → 待核验(09-27)。
const RETRY_NOTE: &str =
    "（官方：非 2XY 状态码即投递失败，按合理次数重推后放弃，精确时刻表未公开）";

/// secret_token 合法性（§4.1 逐字）：1–256 字符，仅 A-Z、a-z、0-9、_、-。
/// 越限或含非法字符的 token 无法由真实 setWebhook 配出——直发前拒绝并注明，
/// 不产出真实 Telegram 不会发出的请求。
pub(crate) fn secret_token_valid(secret_token: &str) -> bool {
    let length = secret_token.chars().count();
    (1..=256).contains(&length)
        && secret_token
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

/// 从明文 JSON Update 提取 update_id 快照（§2.1 去重/恢复顺序的幂等键）：
/// 数字形态取十进制串（官方样本 10000 即 JSON number），字符串形态原样；
/// 缺失/非标量不落值。
fn update_id_of(body: &str) -> String {
    let parsed = serde_json::from_str::<serde_json::Value>(body).ok();
    match parsed.as_ref().and_then(|value| value.get("update_id")) {
        Some(serde_json::Value::Number(number)) => number.to_string(),
        Some(serde_json::Value::String(text)) => text.clone(),
        _ => String::new(),
    }
}

/// POST 明文 Update + 恒等头（§4.1/§附速查）：body 逐字节透传不重排
/// （ADR-0001），secret_token 原样进头（无 HMAC，无任何派生计算）；
/// 私有协议原语：探针与直发共用。
fn post_json(
    client: &reqwest::blocking::Client,
    url: &str,
    secret_token: &str,
    body: &str,
) -> DispatchOutcome {
    if secret_token.is_empty() {
        return DispatchOutcome::not_sent(
            "Secret Token 未配置：恒等头 X-Telegram-Bot-Api-Secret-Token 是官方验证链路的唯一要素，无法模拟缺失链路",
        );
    }
    if !secret_token_valid(secret_token) {
        return DispatchOutcome::not_sent(
            "Secret Token 不合法（官方 secret_token 限 1–256 字符，仅 A-Z a-z 0-9 _ -，越限 token 真实 setWebhook 配不出来）",
        );
    }
    let started = std::time::Instant::now();
    let response = client
        .post(url)
        .header(SECRET_TOKEN_HEADER, secret_token)
        .header("Content-Type", "application/json")
        .body(body.to_string())
        .send();
    let elapsed_ms = started.elapsed().as_millis() as u64;
    let (status, receipt, error) = match response {
        Ok(response) => {
            let status = response.status().as_u16();
            let receipt = response.text().unwrap_or_default();
            (status, receipt, None)
        }
        Err(err) => (
            0,
            String::new(),
            Some(format!("{}：{err}", request_error_reason(&err, RETRY_NOTE))),
        ),
    };
    DispatchOutcome {
        msg_id: update_id_of(body),
        signature: secret_token.to_string(),
        timestamp: None,
        request_body: Some(body.to_string()),
        reply: None,
        status,
        elapsed_ms,
        body: receipt,
        error,
    }
}

/// 连接测试（§3.2 无 challenge 握手）：官方未记述任何验证请求，setWebhook
/// 同步返回 True 即成功——探针即 §5.2 官方文本消息核验样本 + 合规恒等头
/// （语义同普通推送），成功判 2XY（应答正文无口径）。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let ConnectionConfig::Telegram { url, secret_token } = config else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是 Telegram 渠道，无法执行推送探针".into(),
        };
    };
    let outcome = post_json(client, url, secret_token, GOLDEN_PROBE_PLAINTEXT);
    if let Some(error) = outcome.error {
        return HandshakeOutcome {
            ok: false,
            message: error,
        };
    }
    if !(200..300).contains(&outcome.status) {
        return HandshakeOutcome {
            ok: false,
            message: format!(
                "目标返回 HTTP {}，Update 推送探针未通过（官方无 challenge 握手：setWebhook 同步返回 True 即成功，探针语义同普通推送，成功判 2XY）",
                outcome.status
            ),
        };
    }
    HandshakeOutcome {
        ok: true,
        message: "Update 推送探针被接受：恒等头 X-Telegram-Bot-Api-Secret-Token 原样携带（官方无 HMAC 无 challenge，验证即字符串相等比较），返回 HTTP 2XY".into(),
    }
}

/// Telegram 直发（§附速查）：明文 Update 逐字节透传 + 恒等头原样回显。
/// 明文由前端逐字节拼装，不重排（ADR-0001）；「成功判 2XY，非 2XY 按合理
/// 次数重推」的应答语义由前端期望回执（200/正文不校验）承载。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let ConnectionConfig::Telegram { url, secret_token } = config else {
        return DispatchOutcome::not_sent("配置不是 Telegram 渠道，无法直发");
    };
    post_json(client, url, secret_token, plaintext)
}

/// Telegram 渠道适配器：[`super::ChannelAdapter`] 的 Telegram 实现——合规
/// Update 探针握手与恒等头 JSON 直发；无 HMAC/加密原语（原样比对不引入
/// util 密码学），差异不外溢。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "telegram"
    }

    fn label(&self) -> &'static str {
        "Telegram"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::Telegram { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        let ConnectionConfig::Telegram { url, .. } = config else {
            return None;
        };
        Some(url)
    }

    fn handshake_client(&self) -> reqwest::blocking::Client {
        // 生产用默认客户端：官方无秒级应答 SLA（非 2XY 才重推），本地沿用 5 秒上限
        super::client_with_timeout(std::time::Duration::from_secs(5))
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
