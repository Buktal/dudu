//! QQ 机器人渠道（事实库 docs/research/channels/qq.md，Webhook 子形态，
//! 不做 WS 网关）：op13 验证回调握手（[`verify_handshake`]）+ Ed25519 签名
//! 事件直发（[`dispatch_event`]，含 op13 验证回调模板的回包校验）。
//!
//! 与其他渠道的差异全部留在本模块内（ADR-0001）：
//! - 握手（§3.2）：`POST {"d":{"plain_token":…,"event_ts":…},"op":13}`，头
//!   `User-Agent: QQBot-Callback` + `X-Bot-Appid`；目标须在回包
//!   `{"plain_token":<同值>,"signature":"<128 位 hex>"}` 中回显 plain_token 并
//!   回 `hex(Ed25519.Sign(priv, event_ts + plain_token))`（官方无应答时限口径）
//! - 事件直发（§4.2/附速查）：POST 通用信封 `{id,op:0,d,s,t}`，头
//!   `X-Signature-Ed25519: hex(Ed25519.Sign(priv, timestamp+rawBody))` +
//!   `X-Signature-Timestamp: <秒级字符串>` + `X-Bot-Appid`；事件无 AES 加密体
//! - 密钥派生（§4.2/§5.2）：AppSecret 自我翻倍至 ≥32 字节截断，前 32 字节即
//!   Ed25519 seed——原语单点在 [`sign`]（官方向量回归验收）
//! - 正常事件应答（§3.1/§7.1）：op12 `HTTP Callback ACK` 只定义"代表机器人
//!   收到了平台推送的数据"，回包体格式官方无口径（待核验 09-27）——只看状态码

mod sign;

#[cfg(test)]
mod tests;

use crate::connections::util::now_secs;

use super::adapter::narrow;
use super::{
    no_reply, probe_handshake_outcome, send_measured_outcome, ConnectionConfig, DispatchOutcome,
    DispatchSnapshot, HandshakeOutcome,
};

/// op13 验证回调的官方 UA（事实库 §3.2 请求头逐字：`User-Agent:[QQBot-Callback]`）。
const CALLBACK_USER_AGENT: &str = "QQBot-Callback";

/// op13 plain_token 长度：官方样本 `Arq0D5A61EgUu4OxUvOp` 为 20 位字母数字，
/// rand Alphanumeric（A-Za-z0-9 恰 62 字符，均匀采样无模偏差）取同形态。
fn random_plain_token() -> String {
    use rand::distributions::{Alphanumeric, DistString};
    Alphanumeric.sample_string(&mut rand::thread_rng(), 20)
}

/// op13 请求体的 d 值（事实库 §3.2 信封形态 `{"d":{…},"op":13}`）。
struct ValidationPayload {
    plain_token: String,
    event_ts: String,
}

/// 识别 op13 验证回调载荷（直发模板即此形态）：op 恒为 13、d 内含字符串型
/// plain_token/event_ts 才算命中；其余载荷一律按普通事件走签名直发。
fn parse_validation_payload(body: &str) -> Option<ValidationPayload> {
    let parsed: serde_json::Value = serde_json::from_str(body).ok()?;
    if parsed.get("op")?.as_i64()? != 13 {
        return None;
    }
    let d = parsed.get("d")?;
    Some(ValidationPayload {
        plain_token: d.get("plain_token")?.as_str()?.to_string(),
        event_ts: d.get("event_ts")?.as_str()?.to_string(),
    })
}

/// 组装 op13 验证回调请求体（事实库 §3.2 信封逐字形态：d 在前、op 在后）。
fn build_validation_body(plain_token: &str, event_ts: &str) -> String {
    serde_json::json!({
        "d": { "plain_token": plain_token, "event_ts": event_ts },
        "op": 13,
    })
    .to_string()
}

/// op13 目标回包校验（事实库 §3.2）：JSON `{"plain_token","signature"}`，
/// plain_token 须与请求同值，签名按 [`sign::verify_validation`] 校验。
/// 通过返回回显的 plain_token（落回执 reply 快照）。
fn verify_validation_reply(
    app_secret: &str,
    plain_token: &str,
    event_ts: &str,
    response_body: &str,
) -> Result<String, String> {
    let parsed: serde_json::Value = serde_json::from_str(response_body)
        .map_err(|_| format!("回包不是合法 JSON：{response_body}"))?;
    let echoed = parsed
        .get("plain_token")
        .and_then(|value| value.as_str())
        .ok_or_else(|| format!("回包缺少字符串型 plain_token：{response_body}"))?;
    if echoed != plain_token {
        return Err(format!(
            "回包 plain_token（{echoed}）与请求（{plain_token}）不一致"
        ));
    }
    let signature = parsed
        .get("signature")
        .and_then(|value| value.as_str())
        .ok_or_else(|| format!("回包缺少字符串型 signature：{response_body}"))?;
    sign::verify_validation(app_secret, event_ts, plain_token, signature)?;
    Ok(echoed.to_string())
}

/// POST 回调公共体：body 逐字节透传 + 渠道头集合，测量收口统一走
/// [`send_measured_outcome`]（计时/错误文案/快照装订单点），协议快照与
/// Ok 分支增量（reply 推导）由调用侧按请求形态给出。
fn post(
    client: &reqwest::blocking::Client,
    url: &str,
    body: &str,
    headers: &[(&str, String)],
    snapshot: DispatchSnapshot,
    reply: impl FnOnce(u16, &str) -> Option<String>,
) -> DispatchOutcome {
    let mut request = client
        .post(url)
        .header("Content-Type", "application/json")
        .body(body.to_string());
    for (name, value) in headers {
        request = request.header(*name, value);
    }
    send_measured_outcome(request, "", snapshot, reply)
}

/// op13 握手（事实库 §3.2）：随机 plain_token + 当前 event_ts 组验证回调体，
/// 期望 HTTP 2xx 且回包 plain_token 回显 + Ed25519 验签通过（官方未给应答
/// 时限口径，超时上限与直发同取 5s——trait 默认握手客户端）。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    url: &str,
    app_id: &str,
    app_secret: &str,
) -> HandshakeOutcome {
    let plain_token = random_plain_token();
    let event_ts = now_secs().to_string();
    let body = build_validation_body(&plain_token, &event_ts);
    let headers = vec![
        ("User-Agent", CALLBACK_USER_AGENT.to_string()),
        ("X-Bot-Appid", app_id.to_string()),
    ];
    let outcome = post(
        client,
        url,
        &body,
        &headers,
        DispatchSnapshot {
            // plain_token 即本次验证回调的唯一标识快照
            msg_id: plain_token.clone(),
            signature: String::new(),
            timestamp: None,
            request_body: Some(body.clone()),
        },
        no_reply,
    );
    probe_handshake_outcome(
        outcome,
        // qq 官方无应答时限口径：error 后缀与非 2xx 括号注记均无
        "",
        "op13 验证回调握手",
        "",
        "op13 验证回调握手成功：plain_token 原样回显且 Ed25519 签名验签通过",
        |status, body| match verify_validation_reply(app_secret, &plain_token, &event_ts, body) {
            Ok(_) => None,
            Err(reason) => Some(format!("HTTP {status} 但 {reason}")),
        },
    )
}

/// QQ 直发：op13 验证回调模板（官方验证形态，无签名头，回包验签）与普通
/// 事件（X-Signature-Ed25519 签名三头）按载荷形态路由，body 由前端逐字节
/// 拼装，本模块不重排（ADR-0001）。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    url: &str,
    app_id: &str,
    app_secret: &str,
    plaintext: &str,
) -> DispatchOutcome {
    if let Some(payload) = parse_validation_payload(plaintext) {
        return dispatch_validation(client, url, app_id, app_secret, plaintext, &payload);
    }
    // 普通事件（事实库 §4.2/附速查）：签名三头 + 逐字节 body
    let timestamp = now_secs().to_string();
    let signature = sign::sign_event(app_secret, &timestamp, plaintext.as_bytes());
    let headers = vec![
        ("X-Signature-Ed25519", signature.clone()),
        ("X-Signature-Timestamp", timestamp.clone()),
        ("X-Bot-Appid", app_id.to_string()),
    ];
    post(
        client,
        url,
        plaintext,
        &headers,
        DispatchSnapshot {
            // 官方直发请求无唯一标识头（幂等键在信封 id，接收侧解析）
            msg_id: String::new(),
            signature,
            timestamp: Some(timestamp),
            request_body: Some(plaintext.to_string()),
        },
        no_reply,
    )
}

/// op13 验证回调模板直发：同握手形态（`User-Agent: QQBot-Callback` +
/// `X-Bot-Appid`，不带签名头），回包验 plain_token 回显与 Ed25519 签名，
/// 验签通过时把回显值落 reply（期望回执 qqSignReply 的比对输入）。
fn dispatch_validation(
    client: &reqwest::blocking::Client,
    url: &str,
    app_id: &str,
    app_secret: &str,
    plaintext: &str,
    payload: &ValidationPayload,
) -> DispatchOutcome {
    let headers = vec![
        ("User-Agent", CALLBACK_USER_AGENT.to_string()),
        ("X-Bot-Appid", app_id.to_string()),
    ];
    // helper 只在收到响应时调用 reply（错误路径无正文可验）；2xx 门槛在闭包内
    post(
        client,
        url,
        plaintext,
        &headers,
        DispatchSnapshot {
            // plain_token 即本次验证回调的唯一标识快照
            msg_id: payload.plain_token.clone(),
            signature: String::new(),
            timestamp: None,
            request_body: Some(plaintext.to_string()),
        },
        |status, receipt| {
            if (200..300).contains(&status) {
                verify_validation_reply(
                    app_secret,
                    &payload.plain_token,
                    &payload.event_ts,
                    receipt,
                )
                .ok()
            } else {
                None
            }
        },
    )
}

/// QQ 渠道适配器：[`super::ChannelAdapter`] 的 QQ 实现——op13 验证回调握手
/// 与事件/op13 双形态直发按载荷路由；Ed25519 原语在 [`sign`]，差异不外溢。
/// 宽配置 → 渠道字段收窄经 `narrow!` 单点（super::adapter）。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "qq"
    }

    fn label(&self) -> &'static str {
        "QQ 机器人"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::Qq { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> &'a str {
        narrow!(config, Qq { url } => url.as_str())
    }

    fn verify_handshake(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
    ) -> HandshakeOutcome {
        narrow!(config, Qq { url, app_id, app_secret } =>
            verify_handshake(client, url, app_id, app_secret))
    }

    fn dispatch_event(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
        plaintext: &str,
    ) -> DispatchOutcome {
        narrow!(config, Qq { url, app_id, app_secret } =>
            dispatch_event(client, url, app_id, app_secret, plaintext))
    }
}
