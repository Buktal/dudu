//! 钉钉渠道（事实库 docs/research/channels/dingtalk.md，新 HTTP 密文信封子形态，
//! 不做 Stream / 旧 oapi）：check_url 握手（[`verify_handshake`]，1500ms 内
//! 期望加密 success 回包）+ 事件直发（[`dispatch_event`]，密文信封按通道
//! 路由）。与机器人明文通道（[`bot`]，HmacSHA256 头）并行，验签体系完全不同。
//!
//! 与其他渠道的差异全部留在本模块内（ADR-0001）：
//! - 推送形态（§5.10/附）：`POST {url}?signature=…&timestamp=…&nonce=…`，
//!   body `{"encrypt":"<Base64(AES(random16+msg_len4+msg+$key))>"}`，
//!   signature = sha1(字典序排序(token,timestamp,nonce,encrypt))
//! - 握手（§5.6/§5.10）：check_url 解密后 `{"EventType":"check_url"}`，
//!   1500ms 内回 `{"msg_signature","timeStamp","nonce","encrypt":enc("success")}`
//!   （回包先验签再解密，明文含 success 方算通过；suite_ticket 不回会连推 100 次）
//! - AES（§4.1）：key = Base64Decode(EncodingAESKey+"=")、IV = key 前 16B、
//!   PKCS#7-32（官方调试向量实证）、包尾 $key = owner_key——在 [`crypto`]
//! - 机器人通道（§3.3）：明文 JSON + header timestamp/sign = HmacSHA256，见 [`bot`]

mod bot;
mod crypto;

#[cfg(test)]
mod tests;

use std::time::Duration;

use super::{
    client_with_timeout, request_error_reason, ConnectionConfig, DingtalkSystem, DispatchOutcome,
    HandshakeOutcome,
};

/// check_url 握手明文（§5.6 解密后逐字）：密文信封由本模块按连接配置封装。
const HANDSHAKE_PLAINTEXT: &str = r#"{"EventType":"check_url"}"#;

/// 事件应答官方窗口（§5.10 镜像全文逐字）：1500ms 内未回正确加密信息即判推送失败。
const RESPONSE_WINDOW_NOTE: &str = "（官方要求 1500ms 内回加密 success 包）";

/// 随机 nonce：官方样本为 16 位字母数字形态（FAQ 向量 A7Co0cJLMzIDtMMI），
/// 从 uuid v4 字节按 62 字符表派生。
fn random_nonce() -> String {
    const ALPHABET: &[u8; 62] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    uuid::Uuid::new_v4()
        .as_bytes()
        .iter()
        .map(|byte| ALPHABET[*byte as usize % 62] as char)
        .collect()
}

fn unix_timestamp_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis())
        .unwrap_or(0)
}

/// 推送 URL 加查询参（§5.10 逐字形态：`http://<url>?signature=…&timestamp=…&nonce=…`）；
/// 目标地址已带查询串时以 & 续接。
fn push_query(url: &str, signature: &str, timestamp: &str, nonce: &str) -> String {
    let separator = if url.contains('?') { '&' } else { '?' };
    format!("{url}{separator}signature={signature}&timestamp={timestamp}&nonce={nonce}")
}

/// 构造一次密文推送的全部要素：明文 → 加密信封 + URL 三参签名。
struct CryptoPush {
    url: String,
    body: String,
    signature: String,
    timestamp: String,
    nonce: String,
}

/// 组装密文推送（§4.1/§5.10）：随机 nonce/当前毫秒 + sha1 四参签名 + 单字段信封。
fn build_crypto_push(
    url: &str,
    plaintext: &str,
    token: &str,
    encoding_aes_key: &str,
    owner_key: &str,
) -> Result<CryptoPush, String> {
    let encrypt = crypto::encrypt_event(encoding_aes_key, plaintext.as_bytes(), owner_key)?;
    let timestamp = unix_timestamp_ms().to_string();
    let nonce = random_nonce();
    let signature = crypto::build_signature(token, &timestamp, &nonce, &encrypt);
    Ok(CryptoPush {
        url: push_query(url, &signature, &timestamp, &nonce),
        body: serde_json::json!({ "encrypt": encrypt }).to_string(),
        signature,
        timestamp,
        nonce,
    })
}

/// 密文通道推送公共体：POST 信封 → 回执 + 可验签解密的加密回包明文。
/// （事件推送官方要求回加密 success 包；解不出加密包时 reply 置 None，
/// 由期望回执比对给出结论。）
fn post_crypto(
    client: &reqwest::blocking::Client,
    push: &CryptoPush,
    token: &str,
    encoding_aes_key: &str,
) -> DispatchOutcome {
    let started = std::time::Instant::now();
    let response = client
        .post(&push.url)
        .header("Content-Type", "application/json")
        .body(push.body.clone())
        .send();
    let elapsed_ms = started.elapsed().as_millis() as u64;
    match response {
        Ok(response) => {
            let status = response.status().as_u16();
            let receipt = response.text().unwrap_or_default();
            let reply = crypto::verify_and_decrypt_reply(token, encoding_aes_key, &receipt).ok();
            DispatchOutcome {
                msg_id: push.nonce.clone(),
                signature: push.signature.clone(),
                timestamp: Some(push.timestamp.clone()),
                request_body: Some(push.body.clone()),
                reply,
                status,
                elapsed_ms,
                body: receipt,
                error: None,
            }
        }
        Err(err) => DispatchOutcome {
            msg_id: push.nonce.clone(),
            signature: push.signature.clone(),
            timestamp: Some(push.timestamp.clone()),
            request_body: Some(push.body.clone()),
            reply: None,
            status: 0,
            elapsed_ms,
            body: String::new(),
            error: Some(format!("{}：{err}", request_error_reason(&err, ""))),
        },
    }
}

/// 密文通道 check_url 握手（事实库 §5.6/§5.10）：推送加密 check_url 事件
/// （sha1 四参 URL 签名），目标 1500ms 内须回可验签解密的加密 success 包。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let ConnectionConfig::Dingtalk {
        url,
        token,
        encoding_aes_key,
        owner_key,
        system,
        ..
    } = config
    else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是钉钉渠道，无法执行 check_url 握手".into(),
        };
    };
    if *system == DingtalkSystem::Bot {
        return bot::verify_handshake(client, config);
    }
    let push = match build_crypto_push(url, HANDSHAKE_PLAINTEXT, token, encoding_aes_key, owner_key)
    {
        Ok(push) => push,
        Err(reason) => {
            return HandshakeOutcome {
                ok: false,
                message: format!("握手信封封装失败：{reason}"),
            };
        }
    };
    let outcome = post_crypto(client, &push, token, encoding_aes_key);
    if let Some(error) = outcome.error {
        return HandshakeOutcome {
            ok: false,
            message: format!("{error}{RESPONSE_WINDOW_NOTE}"),
        };
    }
    if !(200..300).contains(&outcome.status) {
        return HandshakeOutcome {
            ok: false,
            message: format!(
                "目标返回 HTTP {}，check_url 握手未通过{RESPONSE_WINDOW_NOTE}",
                outcome.status
            ),
        };
    }
    match &outcome.reply {
        Some(plaintext) if plaintext.contains("success") => HandshakeOutcome {
            ok: true,
            message: "check_url 握手成功：加密 success 回包已验签解密（URL sha1 四参签名被接受）"
                .into(),
        },
        Some(plaintext) => HandshakeOutcome {
            ok: false,
            message: format!("HTTP 200 但加密回包解密明文不为 success：{plaintext}"),
        },
        None => HandshakeOutcome {
            ok: false,
            message: format!(
                "HTTP 200 但目标未回可验签解密的加密 success 回包：{}",
                outcome.body
            ),
        },
    }
}

/// 钉钉直发：密文信封（事件）/ 明文 + HmacSHA256 头（机器人）按通道路由，
/// 明文由前端逐字节拼装，本模块只做协议封装不重排（ADR-0001）。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let ConnectionConfig::Dingtalk {
        url,
        token,
        encoding_aes_key,
        owner_key,
        system,
        ..
    } = config
    else {
        return DispatchOutcome::not_sent("配置不是钉钉渠道，无法直发");
    };
    if *system == DingtalkSystem::Bot {
        return bot::dispatch_event(client, config, plaintext);
    }
    let push = match build_crypto_push(url, plaintext, token, encoding_aes_key, owner_key) {
        Ok(push) => push,
        Err(reason) => return DispatchOutcome::not_sent(format!("事件加密封装失败：{reason}")),
    };
    post_crypto(client, &push, token, encoding_aes_key)
}

/// 钉钉渠道适配器：[`super::ChannelAdapter`] 的钉钉实现——check_url 握手
/// （1500ms 加密 success 回包）与密文/机器人双通道直发按连接配置路由；
/// sha1 四参验签与 AES 信封原语在 [`crypto`]，机器人 HmacSHA256 在 [`bot`]。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "dingtalk"
    }

    fn label(&self) -> &'static str {
        "钉钉"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::Dingtalk { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        let ConnectionConfig::Dingtalk { url, .. } = config else {
            return None;
        };
        Some(url)
    }

    fn handshake_client(&self) -> reqwest::blocking::Client {
        // 生产用默认客户端：事件应答官方窗口 1500ms（事实库 §5.10）
        client_with_timeout(Duration::from_millis(1500))
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
