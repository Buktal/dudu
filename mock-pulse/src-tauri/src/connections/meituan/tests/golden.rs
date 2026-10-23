//! 签名黄金向量与表单编解码语义（事实库 meituan.md §4.1/§5.1/§5.3，无需网络）：
//! 官方 §5.1 向量 00934d 黄金对拍、字母序 k=v 排序拼串、中文按原文参签、
//! 防篡改、timestamp 秒形态、表单解码/编码、旧 sig 剔除、订单号快照。

use super::*;

#[test]
fn sign_matches_official_vector_00934d() {
    // 官方 §5.1 黄金向量（事实库逐字）：三参数字母序 k=v & 连接、url? 前缀、
    // secret 无缝尾拼、MD5 小写
    assert_eq!(
        mt_sign(GOLDEN_URL, &GOLDEN_REQUEST_PARAMS, GOLDEN_SECRET),
        GOLDEN_SIGN
    );
    // 输入参数序不敏感：乱序输入与官方拼串序（app_id,app_poi_codes,timestamp）
    // 同结果
    let mut scrambled = GOLDEN_REQUEST_PARAMS;
    scrambled.reverse();
    assert_eq!(mt_sign(GOLDEN_URL, &scrambled, GOLDEN_SECRET), GOLDEN_SIGN);
}

#[test]
fn sign_concatenates_verbatim_documented_string() {
    // 官方 §5.1 待签串逐字复现：url? + 字母序 k=v & 连接 + secret 无缝拼接
    let mut sorted = GOLDEN_REQUEST_PARAMS.to_vec();
    sorted.sort_by(|a, b| a.0.cmp(b.0));
    let query: String = sorted
        .iter()
        .map(|(key, value)| format!("{key}={value}"))
        .collect::<Vec<_>>()
        .join("&");
    let concat = format!("{GOLDEN_URL}?{query}{GOLDEN_SECRET}");
    assert_eq!(concat, GOLDEN_SIGN_CONCAT);
    // 该待签串的 MD5 小写即官方向量（拼串与签名双重锚定）
    assert_eq!(crate::connections::util::md5_hex(&[&concat]), GOLDEN_SIGN);
    assert_eq!(mt_sign(GOLDEN_URL, &sorted, GOLDEN_SECRET), GOLDEN_SIGN);
}

#[test]
fn sign_sorts_bytewise_and_output_is_lowercase_hex() {
    // 字节序语义：大写字母（Z=0x5A）排在小写字母（a=0x61）之前——官方口径
    // 「按参数名字母顺序排序」按字节序内部排序
    let signature = mt_sign(
        GOLDEN_URL,
        &[("Zebra", "1"), ("apple", "2"), ("App_id", "3")],
        GOLDEN_SECRET,
    );
    let byte_order = mt_sign(
        GOLDEN_URL,
        &[("App_id", "3"), ("Zebra", "1"), ("apple", "2")],
        GOLDEN_SECRET,
    );
    assert_eq!(signature, byte_order);
    // 官方口径「MD5 加密得 32 位签名，字母小写」：32 位小写 hex
    assert_eq!(signature.len(), 32);
    assert!(signature
        .chars()
        .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
}

#[test]
fn sign_covers_decoded_values_and_changes_with_param_or_secret() {
    // 中文保持原文、不单独转码（§4.1 逐字）：签名吃解码后的原文值，与百分号
    // 编码形态的拼串结果不同
    let decoded = mt_sign(
        GOLDEN_URL,
        &[("app_poi_code", "668921"), ("wm_poi_name", "药品01店")],
        GOLDEN_SECRET,
    );
    let encoded = mt_sign(
        GOLDEN_URL,
        &[
            ("app_poi_code", "668921"),
            ("wm_poi_name", "%E8%8D%AF%E5%93%8101%E5%BA%97"),
        ],
        GOLDEN_SECRET,
    );
    assert_ne!(decoded, encoded);
    // 参数值任何字节变化签名即变化
    let tampered = mt_sign(
        GOLDEN_URL,
        &[("app_poi_code", "668922"), ("wm_poi_name", "药品01店")],
        GOLDEN_SECRET,
    );
    assert_ne!(tampered, decoded);
    // secret 篡改即变（尾拼 secret，替换后摘要必变）
    assert_ne!(
        mt_sign(
            GOLDEN_URL,
            &[("app_poi_code", "668921"), ("wm_poi_name", "药品01店")],
            "d31ba58fd73c71db697ab5e4946d52X"
        ),
        decoded
    );
}

#[test]
fn timestamp_is_unix_seconds_string() {
    // 官方 §4.1/§6 口径：「timestamp（调用时时间戳）」，guide/31 样本
    // 1389751221 即十进制秒数字符串
    assert_eq!(mt_timestamp(0), "0");
    assert_eq!(mt_timestamp(1_389_751_221), "1389751221");
}

#[test]
fn percent_decode_restores_utf8_bytes_and_plus_as_space() {
    // 官方 §5.3 样本「药品01店」的百分号编码 → 原文（签名输入）
    assert_eq!(percent_decode("%E8%8D%AF%E5%93%8101%E5%BA%97"), "药品01店");
    // form 惯例「+」还原空格；非编码文本原样
    assert_eq!(percent_decode("a+b%2Bc"), "a b+c");
    assert_eq!(percent_decode("668921"), "668921");
}

#[test]
fn form_encode_value_matches_rfc3986_uppercase() {
    // 非保留字集原样，其余大写 %XX（与前端 form.ts 同一语义）
    assert_eq!(
        form_encode_value("a b+c=d.e~f-g_h"),
        "a%20b%2Bc%3Dd.e~f-g_h"
    );
    assert_eq!(form_encode_value("药品"), "%E8%8D%AF%E5%93%81");
    assert_eq!(form_encode_value(""), "");
}

#[test]
fn form_pairs_decodes_document_order_and_keeps_empty_values() {
    // 文档序解码 kv；无值参数落空串（官方「没有值的参数也需拼接」§4.1）
    let pairs = form_pairs(GOLDEN_ORDER_BODY);
    assert_eq!(
        pairs,
        vec![
            ("app_poi_code".to_string(), "668921".to_string()),
            ("order_id".to_string(), "27061900338318741".to_string()),
            ("wm_poi_name".to_string(), "药品01店".to_string()),
        ]
    );
    let bare = form_pairs("extended_field=&flag&order_id=1");
    assert_eq!(
        bare,
        vec![
            ("extended_field".to_string(), String::new()),
            ("flag".to_string(), String::new()),
            ("order_id".to_string(), "1".to_string()),
        ]
    );
    // 空段（连续 &）跳过
    assert_eq!(form_pairs("a=1&&b=2").len(), 2);
}

#[test]
fn strip_sig_removes_only_sig_pair_verbatim() {
    // 旧 sig 剔除、其余段原字节保留（重签语义：sig 除外，官方 §4.1 逐字）
    assert_eq!(
        strip_sig("app_id=1&sig=abcdef&order_id=2"),
        "app_id=1&order_id=2"
    );
    assert_eq!(strip_sig("sig=abcdef"), "");
    assert_eq!(strip_sig(GOLDEN_ORDER_BODY), GOLDEN_ORDER_BODY);
    // 非同名字段（signature 等）不受影响
    assert_eq!(strip_sig("signature=x&a=1"), "signature=x&a=1");
}

#[test]
fn sign_params_merges_public_params_with_payload_keys() {
    // 系统级参数并入参数集；同名键以明文为准；sig 恒排除（官方口径逐字）
    let pairs = form_pairs(&format!("{GOLDEN_ORDER_BODY}&sig=old"));
    let params = sign_params("1235123121", "1389751221", &pairs);
    assert!(params.contains(&("app_id".to_string(), "1235123121".to_string())));
    assert!(params.contains(&("timestamp".to_string(), "1389751221".to_string())));
    assert!(params.iter().all(|(key, _)| key != "sig"));
    // 明文已带 app_id/timestamp 时让位（防重复键破坏排序拼串）
    let with_public = form_pairs("app_id=999&timestamp=42&order_id=1");
    let params = sign_params("1235123121", "1389751221", &with_public);
    assert!(params.contains(&("app_id".to_string(), "999".to_string())));
    assert!(params.contains(&("timestamp".to_string(), "42".to_string())));
}

#[test]
fn message_id_snapshot_follows_payload_order_id() {
    // 幂等键官方无命名：快照取载荷订单号，缺失不落值
    let pairs = form_pairs(GOLDEN_ORDER_BODY);
    assert_eq!(message_id_of(&pairs), "27061900338318741");
    assert_eq!(
        message_id_of(&form_pairs(GOLDEN_PROBE_BODY)),
        "27061900338318741"
    );
    assert_eq!(message_id_of(&form_pairs("app_poi_code=668921")), "");
}
