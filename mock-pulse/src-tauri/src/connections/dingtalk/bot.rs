//! 钉钉机器人收消息通道（事实库 docs/research/channels/dingtalk.md §3.3/§4.2/
//! §5.1/§5.7，独立于事件密文信封体系）：
//! - 明文 POST：报文即前端逐字节拼装的明文 JSON（6 msgtype），不加密不进信封
//! - 验签头（§3.3 逐字）：`timestamp`（毫秒）+ `sign`；
//!   `stringToSign = timestamp + "\n" + appSecret`，
//!   `sign = Base64(HmacSHA256(stringToSign, key=appSecret))`；
//!   timestamp 与现在差 >1h 判非法（本工具每次直发现生成当前毫秒）
//! - 握手：官方无独立握手事件——按官方收消息形态发最小 text 探测
//!   （`{"msgtype":"text","text":{"content":"你好"}}` 官方片段逐字）+
//!   规范验签头，目标响应 HTTP 2xx 即连通（官方未定义回包语义，正文不校验）

use super::super::{
    no_reply, send_measured_outcome, ConnectionConfig, DispatchOutcome, DispatchSnapshot,
    HandshakeOutcome,
};
use crate::connections::util;

/// 官方 text 片段（§5.1 同页逐字）作连通探测体（最小官方形态，不编造）。
const PROBE_PLAINTEXT: &str = r#"{"msgtype":"text","text":{"content":"你好"}}"#;

/// 机器人 sign（§4.2 官方 Java 示例同构）：Base64(HmacSHA256(timestamp +
/// "\n" + appSecret, key=appSecret))；原语 RFC 4231 向量验收（util）。
pub fn build_sign(app_secret: &str, timestamp: &str) -> String {
    util::hmac_sha256_base64(app_secret, &format!("{timestamp}\n{app_secret}"))
}

/// 明文 POST（§3.3）：头只带 Content-Type + timestamp/sign，body 逐字节透传。
fn post(
    client: &reqwest::blocking::Client,
    url: &str,
    body: &str,
    app_secret: &str,
) -> DispatchOutcome {
    let timestamp = util::now_millis().to_string();
    let sign = build_sign(app_secret, &timestamp);
    let request = client
        .post(url)
        .header("Content-Type", "application/json; charset=utf-8")
        .header("timestamp", &timestamp)
        .header("sign", &sign)
        .body(body.to_string());
    send_measured_outcome(
        request,
        "",
        DispatchSnapshot {
            // 发送唯一标识在明文载荷的 msgId（幂等键由接收侧解析，头部无 nonce 可快照）
            msg_id: String::new(),
            signature: sign,
            timestamp: Some(timestamp),
            request_body: Some(body.to_string()),
        },
        no_reply,
    )
}

/// 机器人通道握手（官方无握手事件）：按收消息形态发官方 text 片段探测 +
/// 规范 timestamp/sign 头，目标响应 HTTP 2xx 即通过。
/// 私有协议原语：对外只经 [`super::Adapter`]（super::super::ChannelAdapter）路由。
pub(super) fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let ConnectionConfig::Dingtalk {
        url, app_secret, ..
    } = config
    else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是钉钉渠道，无法执行机器人通道探测".into(),
        };
    };
    let outcome = post(client, url, PROBE_PLAINTEXT, app_secret);
    match outcome.error {
        Some(error) => HandshakeOutcome {
            ok: false,
            message: error,
        },
        None if (200..300).contains(&outcome.status) => HandshakeOutcome {
            ok: true,
            message: format!(
                "机器人通道探测成功：timestamp/sign（HmacSHA256）验签头已发送并被接收（HTTP {}）",
                outcome.status
            ),
        },
        None => HandshakeOutcome {
            ok: false,
            message: format!(
                "目标返回 HTTP {}，机器人通道探测未通过（官方未定义回包语义，2xx 即视为连通）",
                outcome.status
            ),
        },
    }
}

/// 机器人通道直发：明文逐字节 POST + 每次重生成 timestamp/sign（1h 时钟窗）。
/// 私有协议原语：对外只经 [`super::Adapter`]（super::super::ChannelAdapter）路由。
pub(super) fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    plaintext: &str,
) -> DispatchOutcome {
    let ConnectionConfig::Dingtalk {
        url, app_secret, ..
    } = config
    else {
        return DispatchOutcome::not_sent("配置不是钉钉渠道，无法直发");
    };
    post(client, url, plaintext, app_secret)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_sign_matches_official_string_to_sign() {
        // 官方 §5.7 Java 样本参数（timestamp=1577262236757，appSecret=
        // "this is a secret"）；官方 sign 列为占位符，期望值由同算法
        // Node crypto 交叉复算收口（HMAC 原语另有 RFC 4231 独立向量）
        assert_eq!(
            build_sign("this is a secret", "1577262236757"),
            "DJrE6qdyVGCQz9z5r2MDuNcNAhwYnuAkyj13cx169CA="
        );
    }
}
