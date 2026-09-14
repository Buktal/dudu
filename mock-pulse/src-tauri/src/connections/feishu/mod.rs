//! 飞书渠道（事实库 docs/research/channels/feishu.md，Webhook 子形态 JSON v2.0）：
//! POST url_verification challenge 握手（[`verify_handshake`]，现行 1s 应答
//! 口径、challenge 原样回显）+ 事件直发（[`dispatch_event`]，明文/加密双格式
//! 按 Encrypt Key 路由）。
//!
//! 与其他渠道的差异全部留在本模块内（ADR-0001）：
//! - 握手是 POST JSON：challenge/token/type 三参（官方 §3.2），期望 HTTP 200
//!   且 `{"challenge":"<同值>"}` 原样回显；配置 Encrypt Key 时验证请求体整体
//!   加密为 `{"encrypt":"<base64>"}`（自测 curl 命令同构）
//! - 签名（官方 §4.2）：X-Lark-Signature = hex(sha256(timestamp + nonce +
//!   encrypt_key + 原始 body))，配 Encrypt Key 后必须用；明文模式（无
//!   Encrypt Key，官方 §4.1 默认低安全形态）只发 Content-Type，无签名头
//! - 加密信封（官方 §4.3）：body 仅 `{"encrypt":"<base64(IV+密文)>"}`，
//!   key = sha256(encrypt_key)、IV 为解码后前 16B——与微信族 key 推导、
//!   IV 位置、补位块均不同，原语单点在 [`crypto`]
//! - 事件应答（官方 §3.3）：3 秒内 HTTP 200 即成功，正文不校验

mod crypto;

#[cfg(test)]
mod tests;

use std::time::Duration;

use super::{
    client_with_timeout, request_error_reason, ConnectionConfig, DispatchOutcome, HandshakeOutcome,
};

/// url_verification 的随机 challenge：32 位小写 hex（官方样本 `ajls384kdjxxxx`
/// 为小写字母数字占位，卡片页样本为 uuid；mock 取 uuid simple 同风格无连字符）。
fn random_challenge() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

fn unix_timestamp_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0)
}

/// 验证请求体的明文 JSON（官方 §3.2 逐字三参，键序随官方样本）。
fn build_verification_body(challenge: &str, token: &str) -> String {
    serde_json::json!({
        "challenge": challenge,
        "token": token,
        "type": "url_verification",
    })
    .to_string()
}

/// 校验目标是否以字符串 challenge 原样回显（官方应答样本 `{"challenge":"…"}`）。
fn check_echo(expected: &str, response_body: &str) -> Result<(), String> {
    let parsed: serde_json::Value = serde_json::from_str(response_body)
        .map_err(|_| format!("响应不是合法 JSON：{response_body}"))?;
    match parsed.get("challenge").and_then(|value| value.as_str()) {
        Some(actual) if actual == expected => Ok(()),
        Some(actual) => Err(format!(
            "响应 challenge（{actual}）与请求（{expected}）不一致"
        )),
        None => Err(format!(
            "响应缺少字符串类型的 challenge 字段：{response_body}"
        )),
    }
}

/// POST url_verification 握手（事实库 §3.2）：随机 challenge → 三参明文体
/// （配 Encrypt Key 时整体 AES 加密 + 三签名头）→ 期望 HTTP 200 且 challenge
/// 原样回显（现行 1s 应答口径；历史卡片页 3s 旧口径兼容，不作为通过条件）。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let ConnectionConfig::Feishu {
        url,
        verification_token,
        encrypt_key,
        ..
    } = config
    else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是飞书渠道，无法执行 url_verification 握手".into(),
        };
    };
    let challenge = random_challenge();
    let plaintext = build_verification_body(&challenge, verification_token);

    // 明文/加密双格式（官方 §3.2）：Encrypt Key 为空发明文三参；非空时整体
    // 加密为单字段信封并附三签名头（签名算法含 encrypt_key，明文模式无签名）。
    let (body, signature_headers) = if encrypt_key.is_empty() {
        (plaintext, Vec::new())
    } else {
        let encrypt = match crypto::encrypt_event(encrypt_key, plaintext.as_bytes()) {
            Ok(encrypt) => encrypt,
            Err(reason) => {
                return HandshakeOutcome {
                    ok: false,
                    message: format!("验证请求加密封装失败：{reason}"),
                };
            }
        };
        let body = serde_json::json!({ "encrypt": encrypt }).to_string();
        let timestamp = unix_timestamp_secs().to_string();
        let nonce = uuid::Uuid::new_v4().simple().to_string();
        let signature = crypto::build_signature(&timestamp, &nonce, encrypt_key, &body);
        (
            body,
            vec![
                ("X-Lark-Request-Timestamp", timestamp),
                ("X-Lark-Request-Nonce", nonce),
                ("X-Lark-Signature", signature),
            ],
        )
    };

    let mut request = client
        .post(url)
        .header("Content-Type", "application/json")
        .body(body);
    for (name, value) in &signature_headers {
        request = request.header(*name, value);
    }

    let response = match request.send() {
        Ok(response) => response,
        Err(err) => {
            return HandshakeOutcome {
                ok: false,
                message: format!(
                    "{}：{err}",
                    request_error_reason(&err, "（官方要求 1 秒内应答）")
                ),
            };
        }
    };

    let status = response.status();
    if !status.is_success() {
        return HandshakeOutcome {
            ok: false,
            message: format!("目标返回 HTTP {status}，challenge 握手未通过"),
        };
    }

    let text = response.text().unwrap_or_default();
    match check_echo(&challenge, &text) {
        Ok(()) => HandshakeOutcome {
            ok: true,
            message: format!(
                "url_verification 握手成功：challenge 原样回显（HTTP 200，{}）",
                if encrypt_key.is_empty() {
                    "明文三参请求"
                } else {
                    "AES 加密信封 + X-Lark-Signature 签名"
                }
            ),
        },
        Err(reason) => HandshakeOutcome {
            ok: false,
            message: format!("HTTP 200 但 {reason}"),
        },
    }
}

/// 飞书直发：明文逐字节 / 加密信封按 Encrypt Key 路由，body 不重排（ADR-0001）。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let ConnectionConfig::Feishu { encrypt_key, .. } = config else {
        return DispatchOutcome::not_sent("配置不是飞书渠道，无法直发");
    };

    // 明文模式（官方 §4.1 默认）：仅 Content-Type，无签名头可快照；
    // 加密模式（官方 §4.2/§4.3）：单字段信封 + 三签名头。
    let (body, signature, timestamp, msg_id) = if encrypt_key.is_empty() {
        (plaintext.to_string(), String::new(), None, String::new())
    } else {
        let encrypt = match crypto::encrypt_event(encrypt_key, plaintext.as_bytes()) {
            Ok(encrypt) => encrypt,
            Err(reason) => return DispatchOutcome::not_sent(format!("事件加密封装失败：{reason}")),
        };
        let body = serde_json::json!({ "encrypt": encrypt }).to_string();
        let timestamp = unix_timestamp_secs().to_string();
        let nonce = uuid::Uuid::new_v4().simple().to_string();
        let signature = crypto::build_signature(&timestamp, &nonce, encrypt_key, &body);
        (body, signature, Some(timestamp), nonce)
    };

    let mut request = client
        .post(url_of(config))
        .header("Content-Type", "application/json")
        .body(body.clone());
    if let (Some(timestamp), true) = (&timestamp, !signature.is_empty()) {
        request = request
            .header("X-Lark-Request-Timestamp", timestamp)
            .header("X-Lark-Request-Nonce", &msg_id)
            .header("X-Lark-Signature", &signature);
    }

    let started = std::time::Instant::now();
    let response = request.send();

    let elapsed_ms = started.elapsed().as_millis() as u64;
    match response {
        Ok(response) => {
            let status = response.status().as_u16();
            let receipt = response.text().unwrap_or_default();
            DispatchOutcome {
                msg_id,
                signature,
                timestamp,
                request_body: Some(body),
                reply: None,
                status,
                elapsed_ms,
                body: receipt,
                error: None,
            }
        }
        Err(err) => DispatchOutcome {
            msg_id,
            signature,
            timestamp,
            request_body: Some(body),
            reply: None,
            status: 0,
            elapsed_ms,
            body: String::new(),
            error: Some(format!("{}：{err}", request_error_reason(&err, ""))),
        },
    }
}

fn url_of(config: &ConnectionConfig) -> &str {
    let ConnectionConfig::Feishu { url, .. } = config else {
        return "";
    };
    url
}

/// 飞书渠道适配器：[`super::ChannelAdapter`] 的飞书实现——POST challenge
/// 握手（1s 应答窗口，现行口径）与明文/加密双格式直发按连接配置路由；
/// sha256 验签与 AES-256-CBC 信封原语在 [`crypto`]，差异不外溢。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "feishu"
    }

    fn label(&self) -> &'static str {
        "飞书"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::Feishu { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        let ConnectionConfig::Feishu { url, .. } = config else {
            return None;
        };
        Some(url)
    }

    fn handshake_client(&self) -> reqwest::blocking::Client {
        // 生产用默认客户端：challenge 应答现行口径 1 秒内（事实库 §3.2），
        // 本地留 1s 上限（历史卡片页 3s 旧口径兼容，不放宽超时）
        client_with_timeout(Duration::from_secs(1))
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
