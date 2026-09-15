//! 验签黄金向量与信封形态（事实库 kuaishou.md §4.1/§2.2，无需网络）：
//! kwaisign 对拍官方 header 样例值与 Node crypto 交叉复算向量、拼接序固定、
//! 篡改即变；支付族信封键序与样本值逐字锚定。

use super::*;

#[test]
fn kwaisign_matches_official_header_sample_value() {
    // 官方请求示例 header：kwaisign: e10adc…（事实库 §4.1 逐字；复核注明该值
    // 即 MD5("123456")）——body="123456"、secret 为空即复现同一拼接
    assert_eq!(kwaisign("123456", ""), OFFICIAL_HEADER_SAMPLE);
    // 空串拼接 = MD5 空串向量（事实库同注 + RFC 1321）
    assert_eq!(kwaisign("", ""), "d41d8cd98f00b204e9800998ecf8427e");
}

#[test]
fn kwaisign_cross_computes_documented_concatenation() {
    // 官方验证示例口径（§4.1）：toSignStr = body + appSecret，sign = MD5(toSignStr)。
    // 官方 data 段省略，GOLDEN_EVENT_PLAINTEXT 按事实库字段口径构造；
    // 期望值为 Node crypto 对同一拼接串的独立复算结果（与实现无关来源）
    assert_eq!(
        kwaisign(GOLDEN_EVENT_PLAINTEXT, GOLDEN_APP_SECRET),
        "b53943b8374dfbd6539beace9773a110"
    );
}

#[test]
fn kwaisign_changes_with_body_or_secret_and_rejects_forgery() {
    let base = kwaisign(GOLDEN_EVENT_PLAINTEXT, GOLDEN_APP_SECRET);
    // body 原始字符串口径：任何字节变化（含重序列化/加尾空格）签名即变化
    assert_ne!(
        kwaisign(&format!("{GOLDEN_EVENT_PLAINTEXT} "), GOLDEN_APP_SECRET),
        base
    );
    assert_ne!(kwaisign(GOLDEN_EVENT_PLAINTEXT, "Xgm23lSgws235hlg"), base);
    // 拼接序固定：body 在前 secret 在后（secret 前置即另一签名）
    assert_ne!(kwaisign(GOLDEN_APP_SECRET, GOLDEN_EVENT_PLAINTEXT), base);
}

#[test]
fn golden_envelope_matches_official_sample_fields() {
    let parsed: serde_json::Value = serde_json::from_str(GOLDEN_EVENT_PLAINTEXT).unwrap();
    // §4.1 官方样本值逐字：biz_type/message_id/app_id/timestamp
    assert_eq!(parsed["biz_type"], "PAYMENT");
    assert_eq!(parsed["message_id"], GOLDEN_MESSAGE_ID);
    assert_eq!(parsed["app_id"], GOLDEN_APP_ID);
    assert_eq!(parsed["timestamp"], GOLDEN_TIMESTAMP);
    // §4.1 官方 toSignStr 键序逐字：data, biz_type, message_id, app_id, timestamp
    let keys: Vec<&str> = parsed
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    assert_eq!(
        keys,
        ["data", "biz_type", "message_id", "app_id", "timestamp"]
    );
    // data.status 取官方枚举（§2.2 PROCESSING/SUCCESS/FAILED）
    assert_eq!(parsed["data"]["status"], "SUCCESS");
}
