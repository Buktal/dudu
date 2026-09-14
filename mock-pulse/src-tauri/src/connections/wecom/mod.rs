//! 企业微信渠道：GET echostr 握手 + 加密信封直发 + [`Adapter`]。
//! 官方加解密栈（AES 信封 / PKCS#7-32 / 四值签名）单点在 [`crypto`]，
//! 握手与直发只消费其原语；对外只经 [`super::ChannelAdapter`] 路由。

pub(crate) mod crypto;

// 加解密原语在 wecom 域内平铺可取（既有调用方 wecom::encrypt_msg 等路径不变）。
pub(crate) use crypto::{build_signature, decrypt_msg, encrypt_msg};

use std::time::Duration;

use super::{ConnectionConfig, DispatchOutcome, HandshakeOutcome};

/// 16 字节随机数：复用 uuid v4（已在依赖内），一个 v4 即 16 随机字节。
fn random_16() -> [u8; 16] {
    *uuid::Uuid::new_v4().as_bytes()
}

/// echostr 握手的随机明文：32 位 hex（可打印、无引号换行，官方仅要求原样回显）。
fn random_plaintext() -> String {
    uuid::Uuid::new_v4().simple().to_string()
}

fn unix_timestamp_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0)
}

/// 按官方 GET echostr 协议测试连接：
/// 生成随机明文 → 加密成 echostr → 四值字典序签名 → GET 目标 URL →
/// 期望 HTTP 200 且响应体与明文逐字节一致（无引号/无 BOM/无换行即逐字节相等）。
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
        ..
    } = config
    else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是企业微信渠道，无法执行 echostr 握手".into(),
        };
    };

    let plaintext = random_plaintext();
    let echostr = match encrypt_msg(
        encoding_aes_key,
        &random_16(),
        plaintext.as_bytes(),
        corp_id,
    ) {
        Ok(value) => value,
        Err(reason) => {
            return HandshakeOutcome {
                ok: false,
                message: reason,
            }
        }
    };
    let timestamp = unix_timestamp_secs().to_string();
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

    let response = match response {
        Ok(response) => response,
        Err(err) => {
            return HandshakeOutcome {
                ok: false,
                message: format!(
                    "{}：{err}",
                    super::request_error_reason(&err, "（官方要求 1 秒内应答）")
                ),
            };
        }
    };

    let status = response.status();
    if !status.is_success() {
        return HandshakeOutcome {
            ok: false,
            message: format!("目标返回 HTTP {status}，echostr 握手未通过"),
        };
    }

    let body = response.bytes().unwrap_or_default();
    if body.as_ref() == plaintext.as_bytes() {
        HandshakeOutcome {
            ok: true,
            message: "echostr 握手成功：随机明文经 AES 加密签名 GET，解密明文原样回显（HTTP 200）"
                .into(),
        }
    } else {
        let echoed = String::from_utf8_lossy(&body).to_string();
        HandshakeOutcome {
            ok: false,
            message: format!("HTTP 200 但回显与解密明文不一致：{echoed:?}"),
        }
    }
}

/// POST 业务推送信封（官方 §5.1 示例元素序：ToUserName → Encrypt → AgentID）。
/// 明文 XML 字节透传进 Encrypt，不重排。
fn build_envelope_xml(corp_id: &str, msg_encrypt: &str, agent_id: &str) -> String {
    format!(
        "<xml><ToUserName><![CDATA[{corp_id}]]></ToUserName>\
         <Encrypt><![CDATA[{msg_encrypt}]]></Encrypt>\
         <AgentID><![CDATA[{agent_id}]]></AgentID></xml>"
    )
}

/// 从回执文本提取加密被动回复的 Encrypt 密文（§3.5 包结构；无则 None）。
fn extract_reply_encrypt(body: &str) -> Option<&str> {
    const OPEN: &str = "<Encrypt><![CDATA[";
    let start = body.find(OPEN)? + OPEN.len();
    let end = start + body[start..].find("]]>")?;
    Some(&body[start..end])
}

/// 企微直发一条事件：明文 XML → 加密信封（receiveid=corpId）→
/// 四值字典序签名 → text/xml POST（msg_signature/timestamp/nonce 查询参数）。
/// 回执按企微语义处理：空串 / success 原样返回；
/// 若回执是加密被动回复包则解密出明文一并返回（入运行记录）。
///
/// 未发出请求即失败（配置不匹配/加密失败）走 [`DispatchOutcome::not_sent`]：
/// 协议要素不落值，零回执 + 失败原因。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let ConnectionConfig::Wecom {
        url,
        corp_id,
        token,
        encoding_aes_key,
        agent_id,
    } = config
    else {
        return DispatchOutcome::not_sent("配置不是企业微信渠道，无法直发");
    };

    let msg_encrypt = match encrypt_msg(
        encoding_aes_key,
        &random_16(),
        plaintext.as_bytes(),
        corp_id,
    ) {
        Ok(value) => value,
        Err(reason) => return DispatchOutcome::not_sent(reason),
    };
    let timestamp = unix_timestamp_secs().to_string();
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let signature = build_signature(token, &timestamp, &nonce, &msg_encrypt);
    let envelope = build_envelope_xml(corp_id, &msg_encrypt, agent_id);
    let started = std::time::Instant::now();

    let response = client
        .post(url)
        .query(&[
            ("msg_signature", signature.as_str()),
            ("timestamp", timestamp.as_str()),
            ("nonce", nonce.as_str()),
        ])
        .header("Content-Type", "text/xml")
        .body(envelope.clone())
        .send();

    let elapsed_ms = started.elapsed().as_millis() as u64;
    match response {
        Ok(response) => {
            let status = response.status().as_u16();
            let body = response.text().unwrap_or_default();
            let reply = extract_reply_encrypt(&body).and_then(|encrypt| {
                decrypt_msg(encoding_aes_key, encrypt)
                    .ok()
                    .map(|decrypted| String::from_utf8_lossy(&decrypted.msg).to_string())
            });
            DispatchOutcome {
                // 企微的发送唯一标识即 nonce（RunStep.msg_id 快照）
                msg_id: nonce,
                signature,
                timestamp: Some(timestamp),
                request_body: Some(envelope),
                reply,
                status,
                elapsed_ms,
                body,
                error: None,
            }
        }
        Err(err) => DispatchOutcome {
            msg_id: nonce,
            signature,
            timestamp: Some(timestamp),
            request_body: Some(envelope),
            reply: None,
            status: 0,
            elapsed_ms,
            body: String::new(),
            error: Some(format!("{}：{err}", super::request_error_reason(&err, ""))),
        },
    }
}

/// 企微渠道适配器：[`super::ChannelAdapter`] 的企微实现——
/// AES 信封/四值签名/被动回复解密全部复用 crypto 的协议原语，不对外暴露。
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
