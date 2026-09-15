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

use super::{
    client_with_timeout, request_error_reason, ConnectionConfig, DispatchOutcome, HandshakeOutcome,
};

/// op13 验证回调的官方 UA（事实库 §3.2 请求头逐字：`User-Agent:[QQBot-Callback]`）。
const CALLBACK_USER_AGENT: &str = "QQBot-Callback";

/// op13 plain_token 长度：官方样本 `Arq0D5A61EgUu4OxUvOp` 为 20 位字母数字，
/// 从 uuid v4 字节按 62 字符表派生同形态随机串。
fn random_plain_token() -> String {
    const ALPHABET: &[u8; 62] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const LENGTH: usize = 20;
    let uuid = uuid::Uuid::new_v4();
    let bytes = uuid.as_bytes();
    (0..LENGTH)
        .map(|index| ALPHABET[bytes[index % bytes.len()] as usize % 62] as char)
        .collect()
}

fn unix_timestamp_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0)
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

/// POST 回调公共体：body 逐字节透传 + 渠道头集合，回执快照与耗时统一落点。
/// 成功返回（状态码, 回执正文, 耗时 ms）；失败返回（耗时 ms, 人类可读原因）。
fn post(
    client: &reqwest::blocking::Client,
    url: &str,
    body: &str,
    headers: &[(&str, String)],
) -> Result<(u16, String, u64), (u64, String)> {
    let mut request = client
        .post(url)
        .header("Content-Type", "application/json")
        .body(body.to_string());
    for (name, value) in headers {
        request = request.header(*name, value);
    }
    let started = std::time::Instant::now();
    let response = request.send();
    let elapsed_ms = started.elapsed().as_millis() as u64;
    match response {
        Ok(response) => {
            let status = response.status().as_u16();
            let receipt = response.text().unwrap_or_default();
            Ok((status, receipt, elapsed_ms))
        }
        Err(err) => Err((
            elapsed_ms,
            format!("{}：{err}", request_error_reason(&err, "")),
        )),
    }
}

/// op13 握手（事实库 §3.2）：随机 plain_token + 当前 event_ts 组验证回调体，
/// 期望 HTTP 2xx 且回包 plain_token 回显 + Ed25519 验签通过（官方未给应答
/// 时限口径，超时上限与直发同取 5s）。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let Some((url, app_id, app_secret)) = qq_fields(config) else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是 QQ 渠道，无法执行 op13 验证回调握手".into(),
        };
    };
    let plain_token = random_plain_token();
    let event_ts = unix_timestamp_secs().to_string();
    let body = build_validation_body(&plain_token, &event_ts);
    let headers = vec![
        ("User-Agent", CALLBACK_USER_AGENT.to_string()),
        ("X-Bot-Appid", app_id.to_string()),
    ];
    let (status, receipt) = match post(client, url, &body, &headers) {
        Ok((status, receipt, _)) => (status, receipt),
        Err((_, error)) => {
            return HandshakeOutcome {
                ok: false,
                message: error,
            }
        }
    };
    if !(200..300).contains(&status) {
        return HandshakeOutcome {
            ok: false,
            message: format!("目标返回 HTTP {status}，op13 验证回调握手未通过"),
        };
    }
    match verify_validation_reply(app_secret, &plain_token, &event_ts, &receipt) {
        Ok(_) => HandshakeOutcome {
            ok: true,
            message: "op13 验证回调握手成功：plain_token 原样回显且 Ed25519 签名验签通过".into(),
        },
        Err(reason) => HandshakeOutcome {
            ok: false,
            message: format!("HTTP {status} 但 {reason}"),
        },
    }
}

/// QQ 直发：op13 验证回调模板（官方验证形态，无签名头，回包验签）与普通
/// 事件（X-Signature-Ed25519 签名三头）按载荷形态路由，body 由前端逐字节
/// 拼装，本模块不重排（ADR-0001）。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let Some((url, app_id, app_secret)) = qq_fields(config) else {
        return DispatchOutcome::not_sent("配置不是 QQ 渠道，无法直发");
    };
    if let Some(payload) = parse_validation_payload(plaintext) {
        return dispatch_validation(client, url, app_id, app_secret, plaintext, &payload);
    }
    // 普通事件（事实库 §4.2/附速查）：签名三头 + 逐字节 body
    let timestamp = unix_timestamp_secs().to_string();
    let signature = sign::sign_event(app_secret, &timestamp, plaintext.as_bytes());
    let headers = vec![
        ("X-Signature-Ed25519", signature.clone()),
        ("X-Signature-Timestamp", timestamp.clone()),
        ("X-Bot-Appid", app_id.to_string()),
    ];
    let (status, receipt, error, elapsed_ms) = match post(client, url, plaintext, &headers) {
        Ok((status, receipt, elapsed_ms)) => (status, receipt, None, elapsed_ms),
        Err((elapsed_ms, error)) => (0, String::new(), Some(error), elapsed_ms),
    };
    DispatchOutcome {
        // 官方直发请求无唯一标识头（幂等键在信封 id，接收侧解析）
        msg_id: String::new(),
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
    let (status, receipt, error, elapsed_ms) = match post(client, url, plaintext, &headers) {
        Ok((status, receipt, elapsed_ms)) => (status, receipt, None, elapsed_ms),
        Err((elapsed_ms, error)) => (0, String::new(), Some(error), elapsed_ms),
    };
    let reply = if error.is_none() && (200..300).contains(&status) {
        verify_validation_reply(app_secret, &payload.plain_token, &payload.event_ts, &receipt).ok()
    } else {
        None
    };
    DispatchOutcome {
        // plain_token 即本次验证回调的唯一标识快照
        msg_id: payload.plain_token.clone(),
        signature: String::new(),
        timestamp: None,
        request_body: Some(plaintext.to_string()),
        reply,
        status,
        elapsed_ms,
        body: receipt,
        error,
    }
}

/// 从 QQ 连接配置取（url, app_id, app_secret）；非 QQ 配置 None。
fn qq_fields(config: &ConnectionConfig) -> Option<(&str, &str, &str)> {
    let ConnectionConfig::Qq {
        url,
        app_id,
        app_secret,
    } = config
    else {
        return None;
    };
    Some((url, app_id, app_secret))
}

/// QQ 渠道适配器：[`super::ChannelAdapter`] 的 QQ 实现——op13 验证回调握手
/// 与事件/op13 双形态直发按载荷路由；Ed25519 原语在 [`sign`]，差异不外溢。
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

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        qq_fields(config).map(|(url, _, _)| url)
    }

    fn handshake_client(&self) -> reqwest::blocking::Client {
        // 生产用默认客户端：官方未给 op13 应答时限口径（事实库 §7.2 待核验），
        // 与直发同取 5s 上限
        client_with_timeout(std::time::Duration::from_secs(5))
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
