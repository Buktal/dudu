//! 验签黄金向量与信封形态（事实库 taobao.md §4.2/§5.3–§5.6/§5.8，无需网络）：
//! Authorization 对拍 Node crypto 交叉复算向量、拼接序固定（AppKey 前缀 + body、
//! 密钥为 AppSecret）、篡改即变、官方样例头 64 位小写 hex 形态锚定；
//! 四类模板明文的信封键序与官方样本值逐字锚定。

use super::*;

#[test]
fn authorization_cross_computes_documented_concatenation() {
    // 官方验签口径（§4.2 逐字）：消息体 = AppKey + message_body，密钥 = AppSecret，
    // HMAC-SHA256 → hex 小写。期望值为 Node crypto 对同一拼接串的独立复算结果
    // （与实现无关来源；官方样例头无密钥原文，无法作对拍向量）
    assert_eq!(
        authorization(GOLDEN_FORWARD_PLAINTEXT, GOLDEN_APP_KEY, GOLDEN_APP_SECRET),
        "0a03c6fa7156eacf4c1fd4ec688917aac46ad6c26a4c0969a30e9ebe9b43479f"
    );
    assert_eq!(
        authorization(GOLDEN_TRADE_PLAINTEXT, GOLDEN_APP_KEY, GOLDEN_APP_SECRET),
        "714b492696b0ef34abbce9bfb67cc9fc1244a43e7f4de06f1ec45e28c206b1f1"
    );
}

#[test]
fn authorization_output_matches_official_header_sample_shape() {
    // 官方样例头（§5.6 逐字）为 64 位小写 hex；实现输出同形态
    assert_eq!(OFFICIAL_HEADER_SAMPLE.len(), 64);
    assert!(OFFICIAL_HEADER_SAMPLE
        .chars()
        .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
    let signature = authorization(GOLDEN_FORWARD_PLAINTEXT, GOLDEN_APP_KEY, GOLDEN_APP_SECRET);
    assert_eq!(signature.len(), 64);
    assert!(signature
        .chars()
        .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
}

#[test]
fn authorization_changes_with_body_or_secret_and_rejects_forgery() {
    let base = authorization(GOLDEN_TRADE_PLAINTEXT, GOLDEN_APP_KEY, GOLDEN_APP_SECRET);
    // body 原始字符串口径：任何字节变化（含重序列化/加尾空格）签名即变化
    assert_ne!(
        authorization(
            &format!("{GOLDEN_TRADE_PLAINTEXT} "),
            GOLDEN_APP_KEY,
            GOLDEN_APP_SECRET
        ),
        base
    );
    assert_ne!(
        authorization(GOLDEN_TRADE_PLAINTEXT, GOLDEN_APP_KEY, "taobao_app_secre"),
        base
    );
    // 拼接序固定：AppKey 是消息体前缀（body 前置即另一签名）
    assert_ne!(
        authorization(GOLDEN_APP_KEY, GOLDEN_TRADE_PLAINTEXT, GOLDEN_APP_SECRET),
        base
    );
}

#[test]
fn golden_forward_envelope_matches_official_sample_fields() {
    let parsed: serde_json::Value = serde_json::from_str(GOLDEN_FORWARD_PLAINTEXT).unwrap();
    // §5.6 正向样本值逐字：seller_id/message_type/data/timestamp/site
    assert_eq!(parsed["seller_id"], "1234567");
    assert_eq!(parsed["message_type"], 0);
    assert_eq!(parsed["data"]["order_status"], "unpaid");
    assert_eq!(
        parsed["data"]["trade_order_id"],
        GOLDEN_FORWARD_TRADE_ORDER_ID
    );
    assert_eq!(parsed["data"]["trade_order_line_id"], "260422900298363");
    assert_eq!(parsed["data"]["status_update_time"], 1603698638);
    assert_eq!(parsed["timestamp"], 1_603_766_859_530i64);
    assert_eq!(parsed["site"], "lazada_vn");
    // §5.6 官方键序逐字：seller_id/message_type/data/timestamp/site
    let keys: Vec<&str> = parsed
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    assert_eq!(
        keys,
        ["seller_id", "message_type", "data", "timestamp", "site"]
    );
}

#[test]
fn golden_trade_and_refund_payloads_match_official_samples() {
    // §5.3 TradeCreate：数字字段全字符串形态（事实库「ID 形态」速查）
    let trade: serde_json::Value = serde_json::from_str(GOLDEN_TRADE_PLAINTEXT).unwrap();
    assert_eq!(trade["tid"], GOLDEN_TRADE_TID);
    assert_eq!(trade["oid"], "987654321");
    assert_eq!(trade["payment"], "100.00");
    assert_eq!(trade["status"], "TRADE_CREATE");
    assert_eq!(trade["buyer_open_uid"], "AAGq5d-EAAeG3JedwSFpZMe1");
    // §5.4 RefundCreated：refund_id 幂等键 + modified 官方样本时刻
    let refund: serde_json::Value = serde_json::from_str(GOLDEN_REFUND_PLAINTEXT).unwrap();
    assert_eq!(refund["refund_id"], GOLDEN_REFUND_ID);
    assert_eq!(refund["tid"], GOLDEN_REFUND_TID_ALT);
    assert_eq!(refund["modified"], "2000-12-30 12:32:20");
    assert_eq!(refund["refund_phase"], "onsale");
    assert_eq!(refund["bill_type"], "refund_bill");
}

#[test]
fn golden_offmsg_envelope_matches_official_sample_fields() {
    // §5.8 旺旺聊天 envelope（形态参考）：gmt_send 秒级字符串 + msg_id 19 位数字串
    let parsed: serde_json::Value = serde_json::from_str(GOLDEN_OFFMSG_PLAINTEXT).unwrap();
    assert_eq!(parsed["content"], "文本啊啊啊");
    assert_eq!(parsed["to_id"], "it3d3hxlxiaomishu");
    assert_eq!(parsed["from_id"], "it3d3hxltest0");
    assert_eq!(parsed["gmt_send"], "1444297001");
    assert_eq!(parsed["msg_id"], GOLDEN_OFFMSG_MSG_ID);
}

#[test]
fn message_id_snapshot_follows_official_idempotency_keys() {
    // 幂等键快照口径（事实库 §3.3）：交易 tid / 退款 refund_id / OpenIM msg_id /
    // 全球栈信封 data.trade_order_id、data.reverse_order_id
    assert_eq!(message_id_of(GOLDEN_TRADE_PLAINTEXT), GOLDEN_TRADE_TID);
    assert_eq!(message_id_of(GOLDEN_REFUND_PLAINTEXT), GOLDEN_REFUND_ID);
    assert_eq!(message_id_of(GOLDEN_OFFMSG_PLAINTEXT), GOLDEN_OFFMSG_MSG_ID);
    assert_eq!(
        message_id_of(GOLDEN_FORWARD_PLAINTEXT),
        GOLDEN_FORWARD_TRADE_ORDER_ID
    );
    assert_eq!(message_id_of("{}"), "");
}
