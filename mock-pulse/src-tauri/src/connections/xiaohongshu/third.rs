//! 三方私信线索推送通道（docs/research/channels/xiaohongshu-third-im-spec.md
//! §1 [多源]+[联调代码] 级证据）：聚光「私信 API 对接」配置回调后平台 POST
//! 明文 JSON 信封 `{data, timestamp, source}`（data 为线索字段表 §1.4，
//! SnakeCase）；验签走 header X-Red-Signature = "sha1=" + HMAC-SHA1(token,
//! 原始 body)（§1.2，官方验签可选——pushToken 未配置即明文直发不带头；
//! 算法矛盾未决，官方「以 token 为 secretKey」措辞为 HMAC 口径，本侧只发
//! 主算法，dudu-server 接收侧另有 sha1(token+body) 拼接兜底）；应答唯一
//! 要求 HTTP 200（§1.3），失败 30s×3 重试。无官方握手机制（§1.5 消息级
//! 推送信封未公开，无 echo/challenge），连接测试以最小线索推送探针验证
//! 连通——探针刻意不带 leads_id，落到接收侧「未知信封 warn + 200」分支
//! 不落库（dudu-server XiaohongshuThirdImProtocol.parseLead 判型语义），
//! 探针不污染访客库。

use crate::connections::util::hmac_sha1_hex;

use super::super::{
    no_body_check, no_reply, probe_handshake_outcome, send_measured_outcome, DispatchOutcome,
    DispatchSnapshot, HandshakeOutcome,
};

/// 验签头名（spec §1.2 逐字）。
const SIGNATURE_HEADER: &str = "X-Red-Signature";

/// X-Red-Signature 头值（spec §1.2）："sha1=" + HMAC-SHA1(pushToken, body)
/// 40 位小写 hex（官方样本文案含 "sha1= " 空格形态，头值按标准无空格携带）。
pub(crate) fn x_red_signature(push_token: &str, body: &str) -> String {
    format!("sha1={}", hmac_sha1_hex(push_token, body))
}

/// 三方面连接测试探针（spec §1.4 字段表最小形态，值为占位不携带真实业务；
/// 刻意不含 leads_id——见模块头注释，防探针在接收侧落库）。
const PROBE_LEAD: &str = r#"{"data":{"landing_page_id":881,"url":"https://www.xiaohongshu.com/note/01****","submitted_time":"2024-07-24 10:00:00","source_channel":"xx"},"timestamp":1721796000000,"source":"xx"}"#;

/// POST 明文信封并取回执（pushToken 非空时携带验签头，空则官方可选语义
/// 明文直发不带头）。body 逐字节透传不重排（ADR-0001）。
fn post_lead_envelope(
    client: &reqwest::blocking::Client,
    url: &str,
    push_token: &str,
    plaintext: &str,
) -> DispatchOutcome {
    let body = plaintext.trim().to_string();
    let signature = if push_token.is_empty() {
        String::new()
    } else {
        hmac_sha1_hex(push_token, &body)
    };
    let mut request = client
        .post(url)
        .header("Content-Type", "application/json")
        .body(body.clone());
    if !signature.is_empty() {
        request = request.header(SIGNATURE_HEADER, x_red_signature(push_token, &body));
    }
    send_measured_outcome(
        request,
        "",
        // 线索推送无独立消息 ID（幂等键 leads_id:timestamp 在载荷内，§7），
        // msg_id 不落值；signature 落裸 hex（前端快照渲染 sha1= 前缀）；
        // 信封 timestamp 为业务提交时刻非发送时刻，快照不落值
        DispatchSnapshot {
            msg_id: String::new(),
            signature,
            timestamp: None,
            request_body: Some(body),
        },
        no_reply,
    )
}

/// 三方面连接测试（spec §1.5 无官方握手机制）：POST 最小线索探针（占位值），
/// 期望 HTTP 2xx——官方应答唯一要求即状态码，正文无口径（§1.3）。
pub(crate) fn probe_handshake(
    client: &reqwest::blocking::Client,
    url: &str,
    push_token: &str,
) -> HandshakeOutcome {
    let outcome = post_lead_envelope(client, url, push_token, PROBE_LEAD);
    probe_handshake_outcome(
        outcome,
        "（官方失败重推口径：30 秒一次最多 3 次，spec §1.3）",
        "线索推送探针",
        // 403 即接收侧验签不过（pushToken 配错）——官方唯一要求 HTTP 200
        "官方唯一要求 HTTP 200，403 多为接收侧验签不过（核对 pushToken）",
        "线索推送探针成功：明文信封被接受（pushToken 已配置时携带 X-Red-Signature 验签头），HTTP 2xx 即满足官方唯一应答要求",
        no_body_check,
    )
}

/// 三方面直发：明文信封逐字节透传（pushToken 非空时携带验签头）。
pub(crate) fn dispatch_event(
    client: &reqwest::blocking::Client,
    url: &str,
    push_token: &str,
    plaintext: &str,
) -> DispatchOutcome {
    post_lead_envelope(client, url, push_token, plaintext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn x_red_signature_is_hmac_sha1_with_sha1_prefix() {
        // 形态（spec §1.2）："sha1=" + 40 位小写 hex；算法语义与 util 层
        // RFC 2202 向量独立验收，此处锚定组合形态与已知摘要
        let header = x_red_signature("Jefe", "what do ya want for nothing?");
        assert_eq!(
            header,
            "sha1=effcdf6ae5eb2fa2d27416d5f184df9c259a7c79"
        );
    }

    #[test]
    fn probe_lead_parses_and_carries_no_leads_id() {
        // 探针形态锚定：信封判型三键齐备（data 对象 + timestamp 数字 +
        // source 字符串），且刻意无 leads_id（防接收侧落库，模块头注释）
        let parsed: serde_json::Value = serde_json::from_str(PROBE_LEAD).unwrap();
        assert!(parsed["data"].is_object());
        assert_eq!(parsed["timestamp"].as_i64(), Some(1_721_796_000_000));
        assert_eq!(parsed["source"], "xx");
        assert!(parsed["data"].get("leads_id").is_none());
    }
}
