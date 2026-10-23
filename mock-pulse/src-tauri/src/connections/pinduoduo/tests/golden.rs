//! 签名黄金向量与要素形态（事实库 pinduoduo.md §2.1/§4.1/§5.1，无需网络）：
//! 官方 §5.1 向量 E4DE3E 黄金对拍、ASCII 排序与无缝拼接、防篡改、timestamp
//! UNIX 秒形态、探针/样本明文形态、载荷参数集提取。

use super::*;

#[test]
fn sign_matches_official_vector_e4de3e() {
    // 官方 §5.1 黄金向量（事实库标注「可作签名回归向量」逐字）：九参数
    // ASCII 升序 k+v 无缝拼接、testSecret 夹两端、MD5 大写
    assert_eq!(
        pdd_sign(&GOLDEN_REQUEST_PARAMS, GOLDEN_CLIENT_SECRET),
        GOLDEN_SIGN
    );
    // 输入参数序不敏感：乱序输入与官方拼串序（§5.1 签名字符串键序逐字：
    // access_token,client_id,data_type,order_status,page,page_size,timestamp,type）
    // 同结果
    let mut scrambled = GOLDEN_REQUEST_PARAMS;
    scrambled.reverse();
    assert_eq!(pdd_sign(&scrambled, GOLDEN_CLIENT_SECRET), GOLDEN_SIGN);
}

#[test]
fn sign_concatenates_verbatim_documented_string() {
    // 官方 §5.1 签名字符串逐字复现：排序拼接 = 有序多段直接拼接（无缝），
    // secret 夹两端后整体即官方向量的输入原文
    let mut sorted = GOLDEN_REQUEST_PARAMS.to_vec();
    sorted.sort_by(|a, b| a.0.cmp(b.0));
    let concat: String = [
        GOLDEN_CLIENT_SECRET,
        &sorted
            .iter()
            .map(|(k, v)| format!("{k}{v}"))
            .collect::<String>(),
        GOLDEN_CLIENT_SECRET,
    ]
    .concat();
    assert_eq!(concat, GOLDEN_SIGN_CONCAT);
    // 该拼串的 MD5 大写即官方向量（拼串与签名双重锚定）
    assert_eq!(
        crate::connections::util::md5_hex(&[&concat]).to_uppercase(),
        GOLDEN_SIGN
    );
}

#[test]
fn sign_sorts_ascii_and_output_is_uppercase_hex() {
    // ASCII 升序语义：大写字母（Z=0x5A）排在小写字母（a=0x61）之前——
    // 官方口径「首字母以 ASCII 方式升序排列」而非大小写混排的字典序
    let signature = pdd_sign(
        &[("Zebra", "1"), ("apple", "2"), ("Client_id", "3")],
        GOLDEN_CLIENT_SECRET,
    );
    let ascii_order = pdd_sign(
        &[("Client_id", "3"), ("Zebra", "1"), ("apple", "2")],
        GOLDEN_CLIENT_SECRET,
    );
    assert_eq!(signature, ascii_order);
    // 官方口径「得到的 MD5 加密密文后转为大写」：32 位大写 hex
    assert_eq!(signature.len(), 32);
    assert!(signature
        .chars()
        .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_lowercase()));
}

#[test]
fn sign_changes_with_param_value_or_secret_and_rejects_forgery() {
    let base = pdd_sign(&GOLDEN_REQUEST_PARAMS, GOLDEN_CLIENT_SECRET);
    // 参数值任何字节变化签名即变化
    let mut tampered = GOLDEN_REQUEST_PARAMS;
    tampered[5] = ("order_status", "2");
    assert_ne!(pdd_sign(&tampered, GOLDEN_CLIENT_SECRET), base);
    // secret 篡改即变（两端夹 secret，任一端变化都改变摘要）
    assert_ne!(pdd_sign(&GOLDEN_REQUEST_PARAMS, "testSecretX"), base);
    // secret 只夹一端（错误算法）不等于官方口径
    let mut concat = String::new();
    for (key, value) in GOLDEN_REQUEST_PARAMS {
        concat.push_str(key);
        concat.push_str(value);
    }
    assert_ne!(
        crate::connections::util::md5_hex(&[GOLDEN_CLIENT_SECRET, &concat]).to_uppercase(),
        base
    );
}

#[test]
fn timestamp_is_unix_seconds_string() {
    // 官方 §4.1 公共参数表逐字：「时间戳，UNIX 时间（秒）」——十进制秒数字符串
    assert_eq!(pdd_timestamp(0), "0");
    assert_eq!(pdd_timestamp(1_480_411_125), "1480411125");
    // 官方 §5.1 样本时刻的秒值即 1480411125（可直接参签复算官方向量）
    let signature = pdd_sign(
        &[
            ("client_id", "1"),
            ("timestamp", &pdd_timestamp(1_480_411_125)[..]),
        ],
        GOLDEN_CLIENT_SECRET,
    );
    assert_eq!(signature.len(), 32);
}

#[test]
fn probe_and_sample_payloads_match_official_vocabulary() {
    // 探针即官方订单状态样本（§2.1 照录状态 1 + §5.1 order_status 参数逐字，
    // JSON number 形态同官方 body）
    let probe: serde_json::Value = serde_json::from_str(GOLDEN_PROBE_PLAINTEXT).unwrap();
    assert_eq!(probe["order_id"], "123456789");
    assert_eq!(probe["order_status"], 1);
    assert!(probe["order_status"].is_number());
    // 订单样本（§2.1 照录状态 2-已发货代签收锚定）
    let order: serde_json::Value = serde_json::from_str(GOLDEN_ORDER_PLAINTEXT).unwrap();
    assert_eq!(order["order_status"], 2);
}

#[test]
fn payload_params_extracts_top_level_scalars_verbatim() {
    // 顶层标量按原文文本参与（number → serde 文本形态，与官方「所有请求参数」
    // 扁平 kv 口径一致）；嵌套结构取紧凑 JSON 文本；null 跳过
    let params = payload_params(
        r#"{"order_id":"123","order_status":1,"flag":true,"nested":{"k":1},"none":null}"#,
    );
    assert_eq!(
        params,
        vec![
            ("order_id".to_string(), "123".to_string()),
            ("order_status".to_string(), "1".to_string()),
            ("flag".to_string(), "true".to_string()),
            ("nested".to_string(), r#"{"k":1}"#.to_string()),
        ]
    );
    // 非 JSON/非对象明文不落参数（签名仅公共参数也成立）
    assert!(payload_params("not-json").is_empty());
    assert!(payload_params("[1,2]").is_empty());
}

#[test]
fn sign_params_merges_public_params_with_payload_keys() {
    // 公共参数并入参数集；同名键以明文为准（防重复键破坏排序拼串）
    let params = sign_params(
        GOLDEN_CLIENT_ID,
        "1480411125",
        &payload_params(r#"{"order_id":"123","client_id":"1","timestamp":"1480411125"}"#),
    );
    assert_eq!(
        params,
        vec![
            ("order_id".to_string(), "123".to_string()),
            ("client_id".to_string(), "1".to_string()),
            ("timestamp".to_string(), "1480411125".to_string()),
        ]
    );
    // 明文无公共参数键时补齐（query 带出的 client_id/timestamp 参签）
    let filled = sign_params(
        GOLDEN_CLIENT_ID,
        "1480411125",
        &payload_params(GOLDEN_PROBE_PLAINTEXT),
    );
    assert!(filled.contains(&("client_id".to_string(), "1".to_string())));
    assert!(filled.contains(&("timestamp".to_string(), "1480411125".to_string())));
    // 组合签名可复算：公共参数 + 明文顶层 kv 排序参签（探针/直发同规则）
    let borrowed: Vec<(&str, &str)> = filled
        .iter()
        .map(|(k, v)| (k.as_str(), v.as_str()))
        .collect();
    assert_eq!(pdd_sign(&borrowed, GOLDEN_CLIENT_SECRET).len(), 32);
}

#[test]
fn message_id_snapshot_follows_payload_order_id() {
    // 幂等键官方口径待核验(09-27)：快照取载荷订单号，缺失不落值
    assert_eq!(message_id_of(GOLDEN_ORDER_PLAINTEXT), "110770592823138");
    assert_eq!(message_id_of(GOLDEN_PROBE_PLAINTEXT), "123456789");
    assert_eq!(message_id_of(r#"{"order_status":1}"#), "");
}
