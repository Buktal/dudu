//! 电商 ark 推送通道（事实库 docs/research/channels/xiaohongshu.md §2/§3/§5.4，
//! [多源] zsmhub/xhs-sdk 与 cxjava/xhs-sdk 交叉一致）：
//! 平台 POST body 为 `[{msgTag, sellerId, data}, …]` JSON 数组（批量推送），
//! `data` 为内层业务 JSON 序列化字符串（二级转义）；应答 HTTP 200 +
//! `{"success":true,"error_code":0,"error_msg":""}`（§2.1 字段名逐字）。
//! 推送无签名头/无加密（§3.7 两 SDK 均未展示推送侧签名头，官方明文直发）；
//! 首次配置无 echo/challenge 握手（§3.4 未发现），连接测试以最小推送探针
//! （官方构造示例第一条）验证连通性与应答格式。

use super::super::{
    no_reply, probe_handshake_outcome, send_measured_outcome, DispatchOutcome, DispatchSnapshot,
    HandshakeOutcome,
};

/// ark 连接测试探针（事实库 §5.4 官方构造示例逐字，掩码值不携带真实业务）。
const PROBE_ENVELOPE: &str = r#"{"msgTag":"msg_fulfillment_status_change","sellerId":"5e8e****","data":"{\"orderId\":\"P01****\",\"updateTime\":1693500000,\"orderStatus\":4}"}"#;

/// ark 应答官方语义（§2.1/§5.4）：success 为 true 且 error_code 为 0
/// （error_msg 等额外字段允许存在）。解析失败视为不合规。
fn ark_reply_ok(body: &str) -> bool {
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(body) else {
        return false;
    };
    parsed.get("success").and_then(|value| value.as_bool()) == Some(true)
        && parsed.get("error_code").and_then(|value| value.as_i64()) == Some(0)
}

/// POST 单条信封数组并取回执（批量推送的最小形态：数组内一个元素）。
fn post_envelope_array(
    client: &reqwest::blocking::Client,
    url: &str,
    plaintext: &str,
) -> DispatchOutcome {
    // 官方 body 为 JSON 数组（批量推送）：前端逐字节拼装的单条信封按协议
    // 包裹进数组（包裹属通道报文形态，不重排元素内容，ADR-0001）
    let body = format!("[{}]", plaintext.trim());
    send_measured_outcome(
        client
        .post(url)
        .header("Content-Type", "application/json")
        .body(body.clone()),
        "",
        // ark 推送无唯一标识/签名要素（官方无消息 ID、无签名头），快照不落值
        DispatchSnapshot {
            msg_id: String::new(),
            signature: String::new(),
            timestamp: None,
            request_body: Some(body),
        },
        no_reply,
    )
}

/// ark 连接测试（§3.4 无官方握手机制）：POST 最小推送探针（官方构造示例
/// 逐字），期望 HTTP 2xx 且应答体满足官方语义 success=true/error_code=0。
pub(crate) fn probe_handshake(
    client: &reqwest::blocking::Client,
    url: &str,
) -> HandshakeOutcome {
    let outcome = post_envelope_array(client, url, PROBE_ENVELOPE);
    probe_handshake_outcome(
        outcome,
        // ark 无 RETRY 口径（官方无握手口径，注记即本通道事实）
        "（电商 ark 推送无官方握手口径，探针即最小推送）",
        "ark 推送探针",
        r#"期望应答 {"success":true,"error_code":0}"#,
        "ark 推送探针成功：官方数组形态被接受，应答 success/error_code 合规",
        // ark 成功判 2xx + 应答体满足官方语义（§2.1/§5.4），不止状态码；
        // 文案锚定官方「应答 HTTP 200」口径，status 不入文案
        |_, body| {
            if ark_reply_ok(body) {
                None
            } else {
                Some(format!(
                    "HTTP 200 但应答不满足官方语义（期望 success=true 且 error_code=0）：{body}"
                ))
            }
        },
    )
}

/// ark 直发：明文（单条信封元素 JSON）包裹进官方批量数组逐字节透传。
pub(crate) fn dispatch_event(
    client: &reqwest::blocking::Client,
    url: &str,
    plaintext: &str,
) -> DispatchOutcome {
    post_envelope_array(client, url, plaintext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ark_reply_ok_follows_official_semantics() {
        // 官方应答（§5.4 逐字）与允许的额外字段形态
        assert!(ark_reply_ok(r#"{"success":true,"error_code":0,"error_msg":""}"#));
        assert!(ark_reply_ok(r#"{"success":true,"error_code":0}"#));
        // 失败/缺字段/非 JSON 一律不合规
        assert!(!ark_reply_ok(r#"{"success":false,"error_code":500,"error_msg":"boom"}"#));
        assert!(!ark_reply_ok(r#"{"success":true}"#));
        assert!(!ark_reply_ok("not json"));
    }

    #[test]
    fn probe_envelope_matches_official_sample() {
        // 探针即事实库 §5.4 官方构造示例第一条（逐字锚定，防手滑改动）
        let parsed: serde_json::Value = serde_json::from_str(PROBE_ENVELOPE).unwrap();
        assert_eq!(parsed["msgTag"], "msg_fulfillment_status_change");
        assert_eq!(parsed["sellerId"], "5e8e****");
        let data: serde_json::Value =
            serde_json::from_str(parsed["data"].as_str().unwrap()).unwrap();
        assert_eq!(data["orderId"], "P01****");
        assert_eq!(data["orderStatus"], 4);
    }
}
