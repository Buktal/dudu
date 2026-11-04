//! 快手智能客服推送面（事实库 docs/research/channels/kuaishou.md §6.5.3）：
//! 电商开放平台智能客服通道的买家→商家消息异步推送——POST 明文 JSON +
//! header `Ks-Sign` = MD5(AppKey + 原始 body 字符串)（与开放域 kwaisign 的
//! body+AppSecret 拼接顺序相反、header 名不同），应答体由快手侧定义为
//! `{"result":1}`（无 message_id 回传）。无 GET/TEST 握手（推送地址线下
//! 报备），连接测试以最小心跳探针验证：`{"test":true}` 心跳为 §6.2 推送
//! 基座机制，服务侧验签通过即按成功应答，不失为最小连通性探针。

use crate::connections::util::md5_hex;

use super::{
    no_reply, probe_handshake_outcome, send_measured_outcome, DispatchOutcome, DispatchSnapshot,
    HandshakeOutcome,
};

/// 心跳探针载荷（§6.2 推送基座机制逐字）：服务侧按渠道要求成功应答
const HEARTBEAT_PROBE: &str = r#"{"test":true}"#;

/// 智能客服回调验签（§6.5.3 逐字）：Ks-Sign = MD5(AppKey + 原始 body 字符串)，
/// 32 位小写 hex；与开放域 kwaisign 的差异（secret 在前、header 名）留在本面
pub(crate) fn ks_sign(body: &str, app_key: &str) -> String {
    md5_hex(&[app_key, body])
}

/// 心跳探针握手（无官方握手机制）：带 Ks-Sign 的最小推送，期望 HTTP 200 且
/// 应答 result=1（§6.5.3 应答体口径，无 message_id 回传）
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
pub(crate) fn probe_handshake(
    client: &reqwest::blocking::Client,
    url: &str,
    app_key: &str,
) -> HandshakeOutcome {
    let outcome = dispatch_event(client, url, app_key, HEARTBEAT_PROBE);
    probe_handshake_outcome(
        outcome,
        // 智能客服推送无官方重试口径（§6.5.3 未载重试表），注记即本面事实
        "（智能客服推送无官方握手口径，心跳探针即最小推送）",
        "智能客服心跳探针",
        r#"期望应答 {"result":1}"#,
        "智能客服心跳探针成功：Ks-Sign 验签 POST 被接受，应答 result=1（HTTP 200）",
        // 成功判 2xx + result=1（§6.5.3 应答体由快手侧定义），不止状态码
        |status, body| {
            if reply_result_is_ok(body) {
                None
            } else {
                Some(format!("HTTP {status}，但应答不满足官方语义（期望 result=1）：{body}"))
            }
        },
    )
}

/// 智能客服直发（§6.5.3）：明文 JSON 逐字节透传 + header Ks-Sign；message_id
/// 幂等键不存在（智能客服以 requestId 为幂等位），快照取 body 内 requestId
/// 私有协议原语：对外只经 [`Adapter`](super::ChannelAdapter) 路由。
pub(crate) fn dispatch_event(
    client: &reqwest::blocking::Client,
    url: &str,
    app_key: &str,
    body: &str,
) -> DispatchOutcome {
    let signature = ks_sign(body, app_key);
    send_measured_outcome(
        client
            .post(url)
            .header("Ks-Sign", signature.clone())
            .header("Content-Type", "application/json")
            .body(body.to_string()),
        // 智能客服推送无官方重试口径（§6.5.3 未载重试表）
        "（智能客服推送无官方重试口径）",
        DispatchSnapshot {
            msg_id: request_id_of(body),
            signature,
            timestamp: None,
            request_body: Some(body.to_string()),
        },
        no_reply,
    )
}

/// 应答成功判定：result=1（官方口径「返回协议由快手侧定义」§6.5.3 逐字）
fn reply_result_is_ok(body: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| value.get("result").and_then(|result| result.as_i64()))
        .is_some_and(|result| result == 1)
}

/// 从明文 JSON 提取 requestId（智能客服幂等位，§6.5.3 body 表必填）；
/// 非 JSON/缺字段不落值
fn request_id_of(body: &str) -> String {
    serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| {
            value
                .get("requestId")
                .and_then(|id| id.as_str())
                .map(str::to_string)
        })
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 验签拼接顺序黄金锚点：Ks-Sign = MD5(AppKey + body)，与开放域相反
    #[test]
    fn ks_sign_puts_app_key_before_body() {
        // md5_hex 对片段数组按序拼接：app_key 在前、body 在后（§6.5.3 逐字）
        let signed = ks_sign(r#"{"test":true}"#, "APPKEY");
        assert_eq!(signed, md5_hex(&["APPKEY", r#"{"test":true}"#]));
        assert_ne!(signed, md5_hex(&[r#"{"test":true}"#, "APPKEY"]));
    }

    /// 心跳探针应答判定：result=1 过，其余（含非 JSON、缺字段）不过
    #[test]
    fn reply_check_accepts_only_result_one() {
        assert!(reply_result_is_ok(r#"{"result":1}"#));
        // 官方应答体含空格形态等价（JSON 紧凑化后判定）
        assert!(reply_result_is_ok("{ \"result\": 1 }"));
        assert!(!reply_result_is_ok(r#"{"result":0}"#));
        assert!(!reply_result_is_ok(r#"{"message_id":"x"}"#));
        assert!(!reply_result_is_ok("not json"));
    }

    /// requestId 幂等键提取：心跳（无 requestId）不落值
    #[test]
    fn request_id_extraction_ignores_heartbeat() {
        assert_eq!(
            request_id_of(r#"{"requestId":"req-1","type":1}"#),
            "req-1"
        );
        assert_eq!(request_id_of(HEARTBEAT_PROBE), "");
    }
}
