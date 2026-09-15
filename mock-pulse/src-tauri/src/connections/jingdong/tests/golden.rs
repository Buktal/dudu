//! 签名黄金向量与要素形态（事实库 jingdong.md §4.1/§4.2/§5.1–§5.3，无需网络）：
//! JOS 签名对拍 Node crypto 交叉复算向量、参数序内部排序、防篡改、官方键序
//! 锚定、timestamp 官方格式（含 §5.1 样本时刻）、探针/样本明文形态。

use super::*;

#[test]
fn sign_cross_computes_documented_concatenation() {
    // 官方签名口径（§4.1 逐字）：参数按字母序排列拼接 k+v，appSecret 夹两端，
    // MD5 大写。期望值为 Node crypto 对同一拼接串的独立复算结果（官方给出的
    // §5.1 结果 30902CFA… 依赖示例 JSON 确切字节序，文档版式换行不可考，
    // 不作对拍——官方参数值本身已逐字锚定）
    let params = [
        ("360buy_param_json", r#"{"order_id":"123456789","order_state":"WAIT_SELLER_STOCK_OUT"}"#),
        ("app_key", GOLDEN_APP_KEY),
        ("timestamp", GOLDEN_TIMESTAMP),
        ("v", "2.0"),
    ];
    assert_eq!(jos_sign(&params, GOLDEN_APP_SECRET), "B2F24F0CF98CD8123C01B252388F91E5");
    // 授权接口同规则（§4.2：access_token 参签）——第二枚官方参数集向量
    let authorized = [
        ("access_token", "yourtoken"),
        ("360buy_param_json", r#"{"order_id":"123456789","order_state":"WAIT_SELLER_STOCK_OUT"}"#),
        ("app_key", GOLDEN_APP_KEY),
        ("method", "jingdong.pop.order.search"),
        ("timestamp", GOLDEN_TIMESTAMP),
        ("v", "2.0"),
    ];
    assert_eq!(jos_sign(&authorized, GOLDEN_APP_SECRET), "1C7E8A031FC9EB89E86DC28B2305C3A2");
}

#[test]
fn sign_sorts_params_internally_and_output_is_uppercase_hex() {
    // 输入参数序不敏感：乱序输入与官方字母序（§4.1 示例键序逐字
    // 「360buy_param_json,access_token,app_key,method,timestamp,v」）同结果
    let sorted = [
        ("360buy_param_json", "{}"),
        ("app_key", GOLDEN_APP_KEY),
        ("timestamp", GOLDEN_TIMESTAMP),
        ("v", "2.0"),
    ];
    let scrambled = [
        ("v", "2.0"),
        ("timestamp", GOLDEN_TIMESTAMP),
        ("app_key", GOLDEN_APP_KEY),
        ("360buy_param_json", "{}"),
    ];
    let signature = jos_sign(&scrambled, GOLDEN_APP_SECRET);
    assert_eq!(signature, jos_sign(&sorted, GOLDEN_APP_SECRET));
    // 官方口径「再转化成大写」：32 位大写 hex
    assert_eq!(signature.len(), 32);
    assert!(
        signature
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_lowercase())
    );
}

#[test]
fn sign_changes_with_param_value_or_secret_and_rejects_forgery() {
    let base_params = [
        ("360buy_param_json", GOLDEN_ORDER_PLAINTEXT),
        ("app_key", GOLDEN_APP_KEY),
        ("timestamp", GOLDEN_TIMESTAMP),
        ("v", "2.0"),
    ];
    let base = jos_sign(&base_params, GOLDEN_APP_SECRET);
    // 参数值任何字节变化（含 body 尾空格——原始字符串口径）签名即变化
    assert_ne!(
        jos_sign(
            &[
                ("360buy_param_json", &format!("{GOLDEN_ORDER_PLAINTEXT} ")[..]),
                ("app_key", GOLDEN_APP_KEY),
                ("timestamp", GOLDEN_TIMESTAMP),
                ("v", "2.0"),
            ],
            GOLDEN_APP_SECRET
        ),
        base
    );
    // timestamp 出窗（10 分钟窗口校验方）即另一签名
    assert_ne!(
        jos_sign(
            &[
                ("360buy_param_json", GOLDEN_ORDER_PLAINTEXT),
                ("app_key", GOLDEN_APP_KEY),
                ("timestamp", "2021-05-07 09:30:39"),
                ("v", "2.0"),
            ],
            GOLDEN_APP_SECRET
        ),
        base
    );
    // secret 篡改即变（两端夹 secret，任一端变化都改变摘要）
    assert_ne!(jos_sign(&base_params, "yourappSecretX"), base);
    // secret 只夹一端（错误算法）不等于官方口径
    let mut concat = String::new();
    for (key, value) in base_params {
        concat.push_str(key);
        concat.push_str(value);
    }
    assert_ne!(
        crate::connections::util::md5_hex(&[GOLDEN_APP_SECRET, &concat]).to_uppercase(),
        base
    );
}

#[test]
fn timestamp_matches_official_format_and_sample_moment() {
    // 官方格式逐字（§4.1）：yyyy-MM-dd HH:mm:ss，样本时刻 2021-05-07 09:20:39
    // （东八区）；epoch 0 即北京 1970-01-01 08:00:00；闰日 2024-02-29 收口
    assert_eq!(jos_timestamp(1_620_350_439), GOLDEN_TIMESTAMP);
    assert_eq!(jos_timestamp(0), "1970-01-01 08:00:00");
    assert_eq!(jos_timestamp(1_709_179_200), "2024-02-29 12:00:00");
}

#[test]
fn probe_and_golden_payloads_match_official_vocabulary() {
    // 探针即官方状态枚举样本（§5.1 锚定 WAIT_SELLER_STOCK_OUT + §2.1 枚举逐字）
    let probe: serde_json::Value = serde_json::from_str(GOLDEN_PROBE_PLAINTEXT).unwrap();
    assert_eq!(probe["order_id"], "123456789");
    assert_eq!(probe["order_state"], "WAIT_SELLER_STOCK_OUT");
    // §5.2 SDK 示例状态（TRADE_CANCELED 逐字）锚定的订单样本
    let order: serde_json::Value = serde_json::from_str(GOLDEN_ORDER_PLAINTEXT).unwrap();
    assert_eq!(order["order_state"], "TRADE_CANCELED");
    // §5.3 push2 五参数逐字（operatePin 样本 testPin 即官方原文）
    let push2: serde_json::Value = serde_json::from_str(GOLDEN_PUSH2_PLAINTEXT).unwrap();
    assert_eq!(push2["buId"], "123456");
    assert_eq!(push2["operatePin"], "testPin");
    assert_eq!(push2["serviceId"], "1001");
    assert_eq!(push2["orderId"], "123456789");
}

#[test]
fn message_id_snapshot_follows_payload_business_ids() {
    // 幂等键官方口径待核验(09-27)：快照取载荷业务单号（order_id → serviceId/
    // orderId），均缺失不落值
    assert_eq!(message_id_of(GOLDEN_ORDER_PLAINTEXT), "110770592823138");
    assert_eq!(message_id_of(GOLDEN_PUSH2_PLAINTEXT), "123456789");
    assert_eq!(message_id_of(GOLDEN_PROBE_PLAINTEXT), "123456789");
    assert_eq!(message_id_of(r#"{"serviceId":"1001"}"#), "1001");
    assert_eq!(message_id_of("{}"), "");
}
