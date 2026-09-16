//! 快手渠道（事实库 docs/research/channels/kuaishou.md，双域并行共用同一传输
//! 协议）：开放平台 WebHook（信封 `event` 判型：TEST/AUTHORIZE/UN_AUTHORIZE）
//! 与小程序支付回调族（信封 `biz_type` 判型：PAYMENT/REFUND/SETTLE/WITHHOLD/
//! CONTRACT）信封字段不同，验签/应答同族——明文 JSON + header `kwaisign`
//! （无 AES），成功判定恒为「HTTP 200 且 result=1」，失败按重试表重推。
//!
//! 与其他渠道的差异全部留在本模块内（ADR-0001）：
//! - 验签（§4.1）：kwaisign = MD5(${http_body_string} + ${app_secret})——body 用
//!   原始字符串（不得重序列化后再算），签名放 http header `kwaisign`，无 AES
//! - 握手（§3.1/§2.1 TEST）：保存回调地址时平台 POST 一个 TEST 事件验证合法性，
//!   期望应答 `{"result":1,"message_id":"<收到的消息 ID>"}`；连接测试即照此
//!   发送 TEST 事件（信封五字段 {app_id,event,timestamp,message_id,data}）
//! - 直发（§3.1）：POST 明文 JSON（逐字节透传不重排）+ header kwaisign；
//!   message_id 为全局唯一幂等键（重试保持一致，事实库 §3.3）
//! - 应答（§3.2 七页逐字一致）：`{"result":1,"message_id":"…"}`，result=1
//!   之外一律视为失败

#[cfg(test)]
mod tests;

use std::time::Duration;

use crate::connections::util::{md5_hex, now_millis};

use super::{send_measured, ConnectionConfig, DispatchOutcome, HandshakeOutcome};

/// 失败重试口径（附录2 支付回调 16 次重试表 / accessGuide 通用 webhook 重试）：
/// 官方未给统一应答时限，超时文案附重试提示。
const RETRY_NOTE: &str = "（失败平台将按重试表重推，最长 16 次）";

/// 快手回调验签（事实库 §4.1 逐字）：MD5(${http_body_string} + ${app_secret})。
/// body 必须是原始字符串（不得重序列化后再算），输出 32 位小写 hex。
pub(crate) fn kwaisign(body: &str, app_secret: &str) -> String {
    md5_hex(&[body, app_secret])
}

/// 从明文 JSON 提取 message_id（幂等键快照）；非 JSON/缺字段不落值。
fn message_id_of(body: &str) -> String {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("message_id")
                .and_then(|id| id.as_str())
                .map(str::to_string)
        })
        .unwrap_or_default()
}

/// POST 明文 JSON + header kwaisign（两域共用同一传输）：body 逐字节透传不重排
/// （ADR-0001），签名按原始 body 字节计算；message_id 落 msg_id 快照（幂等键）。
fn post_json(
    client: &reqwest::blocking::Client,
    url: &str,
    app_secret: &str,
    body: &str,
) -> DispatchOutcome {
    let signature = kwaisign(body, app_secret);
    let (status, receipt, error, elapsed_ms) = send_measured(
        client
        .post(url)
        .header("kwaisign", signature.clone())
        .header("Content-Type", "application/json")
        .body(body.to_string()),
        RETRY_NOTE,
    );
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

/// 官方成功应答（§3.1/§3.2 七页逐字一致）：HTTP 200 + result=1 + 回传收到的
/// message_id。result≠1（官方口径「1-成功，其他-失败」）、缺字段或回传不一致
/// 均视为失败。
fn result_reply_check(body: &str, sent_message_id: &str) -> Result<(), String> {
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(body) else {
        return Err(format!("应答不是合法 JSON：{body}"));
    };
    match parsed.get("result").and_then(|value| value.as_i64()) {
        Some(1) => {}
        Some(other) => {
            return Err(format!(
                "应答 result={other}（官方口径 1-成功，其他-失败并重试）"
            ))
        }
        None => return Err("应答缺少 result 字段（官方要求回 result=1）".into()),
    }
    match parsed.get("message_id").and_then(|value| value.as_str()) {
        Some(echoed) if echoed == sent_message_id => Ok(()),
        Some(echoed) => Err(format!("应答 message_id 与请求不一致：{echoed}")),
        None => Err("应答缺少 message_id（官方要求回传收到的消息 ID）".into()),
    }
}

/// 连接测试（§3.1 配地址握手 + §2.1 TEST 事件）：保存回调地址时平台即 POST 一个
/// TEST 事件验证合法性——按官方信封五字段构造 TEST 事件（data 只含测试时间戳，
/// 与信封同值），header 带 kwaisign；期望 HTTP 200 且应答 result=1 并原样回传
/// 收到的 message_id。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let ConnectionConfig::Kuaishou {
        url,
        app_id,
        app_secret,
    } = config
    else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是快手渠道，无法执行 TEST 事件握手".into(),
        };
    };
    let timestamp = now_millis() as u64;
    let message_id = uuid::Uuid::new_v4().to_string();
    // TEST 事件信封（§2.1 事件页信封五字段键序 + §3.1 测试样本 data 只含时间戳）
    let body = serde_json::json!({
        "app_id": app_id,
        "event": "TEST",
        "timestamp": timestamp,
        "message_id": message_id,
        "data": { "timestamp": timestamp },
    })
    .to_string();
    let outcome = post_json(client, url, app_secret, &body);
    if let Some(error) = outcome.error {
        return HandshakeOutcome {
            ok: false,
            message: format!("{error}{RETRY_NOTE}"),
        };
    }
    if !(200..300).contains(&outcome.status) {
        return HandshakeOutcome {
            ok: false,
            message: format!(
                "目标返回 HTTP {}，TEST 事件握手未通过（期望应答 {{\"result\":1,\"message_id\":\"…\"}}）",
                outcome.status
            ),
        };
    }
    match result_reply_check(&outcome.body, &message_id) {
        Ok(()) => HandshakeOutcome {
            ok: true,
            message: "TEST 事件握手成功：kwaisign 验签 POST 被接受，应答 result=1 且 message_id 原样回传（HTTP 200）".into(),
        },
        Err(reason) => HandshakeOutcome {
            ok: false,
            message: format!("HTTP {}，但{reason}", outcome.status),
        },
    }
}

/// 快手直发（§3.1）：明文 JSON 逐字节透传 + header kwaisign（两域共用同一
/// 传输；判型字段 event/biz_type 在载荷内，本模块不感知）。明文由前端逐字节
/// 拼装，不重排（ADR-0001）。
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let ConnectionConfig::Kuaishou {
        url, app_secret, ..
    } = config
    else {
        return DispatchOutcome::not_sent("配置不是快手渠道，无法直发");
    };
    post_json(client, url, app_secret, plaintext)
}

/// 快手渠道适配器：[`super::ChannelAdapter`] 的快手实现——TEST 事件握手与
/// kwaisign 签名直发；MD5 原语复用 util（md5_hex），差异不外溢。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "kuaishou"
    }

    fn label(&self) -> &'static str {
        "快手"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::Kuaishou { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        let ConnectionConfig::Kuaishou { url, .. } = config else {
            return None;
        };
        Some(url)
    }

    fn handshake_client(&self) -> reqwest::blocking::Client {
        // 生产用默认客户端：官方未给统一应答时限，本地沿用 5 秒上限
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
