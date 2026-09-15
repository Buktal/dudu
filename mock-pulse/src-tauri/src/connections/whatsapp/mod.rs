//! WhatsApp 渠道（Cloud API Webhook，事实库 docs/research/channels/whatsapp.md）：
//! 单 URL + 必订 messages，仅 HTTPS 传输 + X-Hub-Signature-256 签名校验、
//! 载荷不设加密字段（§4「官方未提供消息体加密机制」）；GET 三参握手
//! （hub.mode=subscribe / hub.challenge / hub.verify_token，200 裸回
//! challenge 非 JSON，不匹配 403）+ JSON 事件直发（HMAC-SHA256 头验签）。
//!
//! 与其他渠道的差异全部留在本模块内（ADR-0001）：
//! - 验签（§4.1 逐字）：「HMAC-SHA256 hash, calculated using the post body
//!   payload and your app secret as the secret key」——X-Hub-Signature-256 =
//!   "sha256=" + hex(HMAC-SHA256(AppSecret, POST 原始 body))；校验对原始字节
//!   算 MAC（先 JSON.parse 再重序列化会改变 digest），Verify token 不参与
//!   POST 验签（仅 GET 握手用）
//! - 握手（§3.2）：每次设置/修改 Callback URL 或 Verify token，Meta 发 GET
//!   三参（hub.mode 恒 subscribe、hub.challenge 为 Meta 生成的随机值须原样
//!   返回、hub.verify_token 与存量比对）；合法 → 200 + hub.challenge 裸值
//!   （纯文本非 JSON，echo-bot 示例 `res.status(200).send(challenge)` 实锤），
//!   非法 → 任何非 200（示例用 403）；常见坑：回 JSON 信封会失败
//! - 直发（§附速查）：POST 明文 JSON 信封（object→entry→changes）逐字节透传
//!   不重排 + X-Hub-Signature-256 头；幂等键 wamid 三处同源
//!   （messages[].id / statuses[].id / 发送响应 messages[].id，官方未指定
//!   幂等键、按 wamid 去重为工程通行做法）
//! - 应答（§3.3 逐字）：「端点回 HTTP 200 即成功；其他状态码或不可达即失败，
//!   Meta 以递减频率重试直到成功，最长 7 天」（No Storage 号限 1 小时）

#[cfg(test)]
mod tests;

use crate::connections::util::hmac_sha256_hex;

use super::{request_error_reason, ConnectionConfig, DispatchOutcome, HandshakeOutcome};

/// 失败重试口径（§3.3 逐字）：非 200 或不可达即失败，Meta 以递减频率重试
/// 直到成功、最长 7 天；超时文案附该语义。
const RETRY_NOTE: &str = "（官方：非 HTTP 200 或不可达即投递失败，Meta 以递减频率重试直到成功，最长 7 天）";

/// WhatsApp 回调验签（事实库 §4.1）：X-Hub-Signature-256 =
/// "sha256=" + hex(HMAC-SHA256(AppSecret, POST 原始 body))，64 位小写 hex。
pub(crate) fn x_hub_signature(body: &str, app_secret: &str) -> String {
    format!("sha256={}", hmac_sha256_hex(app_secret, body))
}

/// 从明文 JSON 信封提取业务幂等键快照：wamid 三处同源（§附速查）——
/// messages[].id（inbound）优先、statuses[].id（outbound 状态）次之，
/// 遍历全部 entry[].changes[]；均缺失（管理面事件）不落值。
fn message_id_of(body: &str) -> String {
    let parsed = serde_json::from_str::<serde_json::Value>(body).ok();
    let changes = parsed
        .as_ref()
        .and_then(|value| value.get("entry"))
        .and_then(|value| value.as_array())
        .map(|entries| {
            entries
                .iter()
                .filter_map(|entry| entry.get("changes"))
                .filter_map(|changes| changes.as_array())
                .flatten()
                .collect::<Vec<_>>()
        });
    let Some(changes) = changes else {
        return String::new();
    };
    for key in ["messages", "statuses"] {
        for change in &changes {
            if let Some(wamid) = change
                .get("value")
                .and_then(|value| value.get(key))
                .and_then(|value| value.as_array())
                .and_then(|items| items.first())
                .and_then(|item| item.get("id"))
                .and_then(|value| value.as_str())
            {
                return wamid.to_string();
            }
        }
    }
    String::new()
}

/// GET 三参首次验证握手（事实库 §3.2）：生成随机 hub.challenge（Meta 侧为
/// 随机 int/字符串，本侧生成同形态的 16 位数字串）→ GET 目标 URL（hub.mode
/// =subscribe + hub.challenge + hub.verify_token）→ 期望 HTTP 200 且响应体
/// 与 hub.challenge 逐字节一致（裸值纯文本非 JSON）。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let ConnectionConfig::Whatsapp {
        url,
        app_secret: _,
        verify_token,
    } = config
    else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是 WhatsApp 渠道，无法执行 GET 三参握手".into(),
        };
    };
    // App Secret 不参与 GET 握手（§4.1：Verify token 与 app secret 是两个
    // 无关值），仅 verify_token 进 query 供目标侧比对。
    let challenge = random_challenge();

    let response = client.get(url).query(&[
        ("hub.mode", "subscribe"),
        ("hub.challenge", challenge.as_str()),
        ("hub.verify_token", verify_token.as_str()),
    ]);

    let response = match response.send() {
        Ok(response) => response,
        Err(err) => {
            return HandshakeOutcome {
                ok: false,
                message: format!(
                    "{}：{err}",
                    request_error_reason(&err, "（官方无秒级应答 SLA，待核验(09-27)）")
                ),
            };
        }
    };

    let status = response.status();
    if !status.is_success() {
        return HandshakeOutcome {
            ok: false,
            message: format!(
                "目标返回 HTTP {status}，verify_token 比对未通过（官方：不匹配回 403 等非 200）"
            ),
        };
    }

    let body = response.bytes().unwrap_or_default();
    if body.as_ref() == challenge.as_bytes() {
        HandshakeOutcome {
            ok: true,
            message: "GET 三参握手成功：verify_token 匹配，HTTP 200 裸回 hub.challenge（纯文本非 JSON）".into(),
        }
    } else {
        let echoed = String::from_utf8_lossy(&body).to_string();
        HandshakeOutcome {
            ok: false,
            message: format!(
                "HTTP 200 但响应不是 hub.challenge 裸值：{echoed:?}（官方要求原样返回纯文本，回 JSON 信封会失败）"
            ),
        }
    }
}

/// POST 明文 JSON + X-Hub-Signature-256 头：body 逐字节透传不重排（ADR-0001），
/// 签名按原始 body 字节现算（官方要求对原始字节算 MAC）；幂等键快照取 wamid。
fn post_json(
    client: &reqwest::blocking::Client,
    url: &str,
    app_secret: &str,
    body: &str,
) -> DispatchOutcome {
    let signature = x_hub_signature(body, app_secret);
    let started = std::time::Instant::now();
    let response = client
        .post(url)
        .header("X-Hub-Signature-256", signature.clone())
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
        msg_id: message_id_of(body),
        signature,
        timestamp: None,
        request_body: Some(body.to_string()),
        reply: None,
        status,
        elapsed_ms,
        body: receipt,
        error,
    }
}

/// WhatsApp 直发（§附速查）：明文 JSON 逐字节透传 + X-Hub-Signature-256 头。
/// 明文由前端逐字节拼装，不重排（ADR-0001）；「端点回 HTTP 200 即成功」的
/// 应答语义由前端期望回执（200/正文不校验）承载。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let ConnectionConfig::Whatsapp {
        url,
        app_secret,
        verify_token: _,
    } = config
    else {
        return DispatchOutcome::not_sent("配置不是 WhatsApp 渠道，无法直发");
    };
    post_json(client, url, app_secret, plaintext)
}

/// 握手 hub.challenge：Meta 生成的随机 int/字符串（§3.2），本侧生成同形态的
/// 16 位数字串（echo-bot 示例 challenge 为随机值、无内容约束）。
fn random_challenge() -> String {
    let uuid = uuid::Uuid::new_v4();
    let bytes = uuid.as_bytes();
    (0..16)
        .map(|index| char::from(b'0' + bytes[index] % 10))
        .collect()
}

/// WhatsApp 渠道适配器：[`super::ChannelAdapter`] 的 WhatsApp 实现——GET 三参
/// 握手与 X-Hub-Signature-256（HMAC-SHA256）签名直发；原语复用 util
/// （hmac_sha256_hex），差异不外溢。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "whatsapp"
    }

    fn label(&self) -> &'static str {
        "WhatsApp"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::Whatsapp { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        let ConnectionConfig::Whatsapp { url, .. } = config else {
            return None;
        };
        Some(url)
    }

    fn handshake_client(&self) -> reqwest::blocking::Client {
        // 生产用默认客户端：官方无秒级应答 SLA（待核验(09-27)），本地沿用 5 秒上限
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
