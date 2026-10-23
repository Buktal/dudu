//! 验签黄金向量与信封形态（事实库 whatsapp.md §4.1/§5.1/§5.2/§附速查，无需
//! 网络）：X-Hub-Signature-256 对拍 Node crypto 交叉复算向量与通行示例向量、
//! "sha256=" 前缀 + 64 位小写 hex 形态、篡改即变；官方核验样本信封键序与
//! 样本值逐字锚定；wamid 幂等键快照的三处同源取值。

use super::*;

#[test]
fn signature_matches_node_cross_computed_vectors() {
    // 官方 §4.1 示例 hash 为截断示意值（b63bb3…0b1f7d2）不可作回归向量；
    // 期望值为 Node crypto 对「原始 body 字节 + AppSecret」的独立复算结果
    // （与实现无关来源）
    assert_eq!(
        x_hub_signature(GOLDEN_INBOUND_PLAINTEXT, GOLDEN_APP_SECRET),
        NODE_INBOUND_SIGNATURE
    );
    assert_eq!(
        x_hub_signature(GOLDEN_DELIVERED_PLAINTEXT, GOLDEN_APP_SECRET),
        NODE_DELIVERED_SIGNATURE
    );
}

#[test]
fn signature_carries_sha256_prefix_and_lowercase_hex_form() {
    let signature = x_hub_signature(GOLDEN_INBOUND_PLAINTEXT, GOLDEN_APP_SECRET);
    assert!(signature.starts_with("sha256="), "{signature:?}");
    let digest = signature.strip_prefix("sha256=").unwrap();
    assert_eq!(digest.len(), 64, "HMAC-SHA256 摘要为 64 位 hex");
    assert!(
        digest
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase()),
        "应为小写 hex：{digest:?}"
    );
    // 组合层复现 HMAC-SHA256 通行示例向量（key="key"）
    assert_eq!(
        x_hub_signature("The quick brown fox jumps over the lazy dog", "key"),
        format!("sha256={KNOWN_FOX_DIGEST}")
    );
}

#[test]
fn signature_changes_with_body_or_secret_and_rejects_forgery() {
    let base = x_hub_signature(GOLDEN_INBOUND_PLAINTEXT, GOLDEN_APP_SECRET);
    // 原始字节口径：任何字节变化（含重序列化/加尾空格）签名即变化——
    // 官方页未明写但第三方一致警告（待核验(09-27)），先 parse 再重序列化
    // 会改变 digest
    assert_ne!(
        x_hub_signature(&format!("{GOLDEN_INBOUND_PLAINTEXT} "), GOLDEN_APP_SECRET),
        base
    );
    assert_ne!(
        x_hub_signature(GOLDEN_INBOUND_PLAINTEXT, "whatsapp_app_secreT"),
        base
    );
    // Verify token 不参与 POST 验签（§4.1：与 app secret 是两个无关值）——
    // 同 body 同 secret 的签名与 token 取值无关（函数签名即无 token 入参）
    assert_eq!(
        x_hub_signature(GOLDEN_INBOUND_PLAINTEXT, GOLDEN_APP_SECRET),
        base
    );
}

#[test]
fn golden_inbound_envelope_matches_official_sample() {
    let parsed: serde_json::Value = serde_json::from_str(GOLDEN_INBOUND_PLAINTEXT).unwrap();
    // §5.1 官方样本值逐字：信封 object→entry→changes→value→contacts/messages
    assert_eq!(parsed["object"], "whatsapp_business_account");
    assert_eq!(parsed["entry"][0]["id"], "102290129340398");
    assert_eq!(parsed["entry"][0]["changes"][0]["field"], "messages");
    let value = &parsed["entry"][0]["changes"][0]["value"];
    assert_eq!(value["messaging_product"], "whatsapp");
    assert_eq!(value["metadata"]["display_phone_number"], "15550783881");
    assert_eq!(value["metadata"]["phone_number_id"], "106540352242922");
    assert_eq!(value["contacts"][0]["wa_id"], "16505551234");
    assert_eq!(value["contacts"][0]["profile"]["name"], "Sheena Nelson");
    assert_eq!(value["messages"][0]["from"], "16505551234");
    assert_eq!(value["messages"][0]["id"], GOLDEN_INBOUND_WAMID);
    assert_eq!(value["messages"][0]["timestamp"], "1749416383");
    assert_eq!(value["messages"][0]["type"], "text");
    assert_eq!(
        value["messages"][0]["text"]["body"],
        "Does it come in another color?"
    );
    // 入站 messages[].timestamp 为秒级字符串形态
    assert!(value["messages"][0]["timestamp"].is_string());
}

#[test]
fn golden_delivered_envelope_matches_official_sample() {
    let parsed: serde_json::Value = serde_json::from_str(GOLDEN_DELIVERED_PLAINTEXT).unwrap();
    // §5.2 官方样本值逐字：statuses + conversation + pricing
    let status = &parsed["entry"][0]["changes"][0]["value"]["statuses"][0];
    assert_eq!(status["id"], GOLDEN_DELIVERED_WAMID);
    assert_eq!(status["status"], "delivered");
    assert_eq!(status["timestamp"], "1750263773");
    assert_eq!(status["recipient_id"], "16505551234");
    assert_eq!(
        status["conversation"]["id"],
        "6ceb9d929c9bdc4f90e967a32f8639b4"
    );
    assert_eq!(status["conversation"]["origin"]["type"], "service");
    assert_eq!(status["pricing"]["billable"], true);
    assert_eq!(status["pricing"]["pricing_model"], "CBP");
    assert_eq!(status["pricing"]["category"], "service");
    // statuses[].id 与入站 messages[].id 同为 wamid 形态（三处同源归一）
    assert!(GOLDEN_DELIVERED_WAMID.starts_with("wamid."));
}

#[test]
fn wamid_snapshot_follows_three_way_source_rule() {
    // inbound：messages[].id 优先（§附速查三处同源）
    assert_eq!(
        message_id_of(GOLDEN_INBOUND_PLAINTEXT),
        GOLDEN_INBOUND_WAMID
    );
    // outbound：无 messages 时取 statuses[].id
    assert_eq!(
        message_id_of(GOLDEN_DELIVERED_PLAINTEXT),
        GOLDEN_DELIVERED_WAMID
    );
    // 多 entry 时遍历全部 changes[]
    let multi_entry = r#"{"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"value":{"metadata":{}},"field":"messages"}]},{"id":"2","changes":[{"value":{"statuses":[{"id":"wamid.SECOND"}]},"field":"messages"}]}]}"#;
    assert_eq!(message_id_of(multi_entry), "wamid.SECOND");
    // 管理面事件（无 wamid）不落值
    let management = r#"{"entry":[{"id":"1","time":1751247548,"changes":[{"value":{"event":"APPROVED"},"field":"message_template_status_update"}]}],"object":"whatsapp_business_account"}"#;
    assert_eq!(message_id_of(management), "");
    assert_eq!(message_id_of("not-json"), "");
}
