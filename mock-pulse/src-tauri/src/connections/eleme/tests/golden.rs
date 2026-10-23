//! 签名黄金对拍与签名原语语义（事实库 eleme.md §4.1/§5.1/§5.2，无需网络）：
//! 官方示例待签串五步复算、SHA1-of-HEX 机制独立向量、ASCII 排序、值 urlencode
//! （空格 +、保留字 %XX）、防篡改、timestamp 秒形态、明文判型、订单号快照、
//! 系统参数并入。

use super::*;

#[test]
fn sign_reproduces_official_example_concat_and_five_steps() {
    // 官方 §4.1 步骤 2 示例待签串逐字复现：url（末尾带 /，官方「计算 sig 时
    // URL 末尾必须带 /」）+ ? + 字母序 k=v & 连接 + secret 无缝尾拼
    let concat =
        format!("{GOLDEN_URL}?consumer_key=7284397484&timestamp=1374908054{GOLDEN_SECRET}");
    assert_eq!(concat, GOLDEN_SIGN_CONCAT);
    // 五步复算 = 官方示例串的既定结果（Node crypto 交叉复算锚定；官方步骤 4
    // 示例值 e76dfee… 为示意值、与示例待签串对不上——真实 secret 未公开，
    // 照录该不自洽，不以示意值作对拍）
    assert_eq!(
        crate::connections::util::sha1_hex(&[&hex::encode(&concat)]),
        GOLDEN_SIGN
    );
    assert_eq!(
        ele_sign(GOLDEN_URL, &GOLDEN_REQUEST_PARAMS, GOLDEN_SECRET),
        GOLDEN_SIGN
    );
}

#[test]
fn sha1_of_hex_mechanics_matches_independent_vector() {
    // 官方五步第 3/4 步机制（B 经 UTF-8 逐字节 HEX 后 SHA1）独立来源向量：
    // sha1(hex("abc"))（Node crypto 交叉复算；Python/PHP/Java 三语言官方示例
    // 同构——Python `.encode('hex')` 后 sha1、Java byte2hex 后 digest）
    assert_eq!(
        crate::connections::util::sha1_hex(&[&hex::encode("abc")]),
        "c3d8b80f92eaf79c90a1b99f37a62c84b1494a38"
    );
    // 区别于对原文直接 SHA1（HEX 中间态是本签名区别于 sha1(B) 的关键）
    assert_ne!(
        crate::connections::util::sha1_hex(&["abc"]),
        "c3d8b80f92eaf79c90a1b99f37a62c84b1494a38"
    );
}

#[test]
fn sign_sorts_bytewise_and_output_is_40_lowercase_hex() {
    // 字节序语义：大写字母（Z=0x5A）排在小写字母（a=0x61）之前——官方口径
    // 「按参数名 ASCII 排序」按字节序内部排序
    let signature = ele_sign(
        GOLDEN_URL,
        &[("Zebra", "1"), ("apple", "2"), ("consumer_key", "3")],
        GOLDEN_SECRET,
    );
    let byte_order = ele_sign(
        GOLDEN_URL,
        &[("consumer_key", "3"), ("Zebra", "1"), ("apple", "2")],
        GOLDEN_SECRET,
    );
    assert_eq!(signature, byte_order);
    // 官方口径「SHA1(C) 十六进制小写」：40 位小写 hex
    assert_eq!(signature.len(), 40);
    assert!(signature
        .chars()
        .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
}

#[test]
fn sign_encodes_values_per_step1_and_eats_decoded_input() {
    // §4.1 步骤 1 编码发生在拼串时（入参为原文值）：中文与保留字符按 UTF-8
    // 字节 %XX 大写、空格编 +，与官方 Python 示例 urllib.quote_plus 同构
    let signature = ele_sign(
        GOLDEN_URL,
        &[("consumer_key", "7284397484"), ("description", "太忙 a")],
        GOLDEN_SECRET,
    );
    let expected_concat = format!(
        "{GOLDEN_URL}?consumer_key=7284397484&description=%E5%A4%AA%E5%BF%99+a{GOLDEN_SECRET}"
    );
    assert_eq!(
        signature,
        crate::connections::util::sha1_hex(&[&hex::encode(expected_concat)])
    );
    // 值变化签名即变化（编码正确性的反向校验）
    assert_ne!(
        signature,
        ele_sign(
            GOLDEN_URL,
            &[("consumer_key", "7284397484"), ("description", "太忙")],
            GOLDEN_SECRET
        )
    );
}

#[test]
fn sig_encode_value_follows_rfc3986_unreserved_with_plus_space() {
    // 未保留字集原样（字母数字 - _ . ~）、空格编 +、保留字符大写 %XX
    assert_eq!(sig_encode_value("a b+c~d/"), "a+b%2Bc~d%2F");
    assert_eq!(sig_encode_value("太忙"), "%E5%A4%AA%E5%BF%99");
    assert_eq!(sig_encode_value("7284397484"), "7284397484");
    assert_eq!(sig_encode_value(""), "");
}

#[test]
fn sign_changes_with_param_url_or_secret() {
    // url 变化（含尾斜杠差异）签名即变化——官方「URL 末尾必须带 /」的审计口径
    assert_ne!(
        ele_sign(GOLDEN_URL, &GOLDEN_REQUEST_PARAMS, GOLDEN_SECRET),
        ele_sign(
            "http://openapi.ele.me/v2/restaurants",
            &GOLDEN_REQUEST_PARAMS,
            GOLDEN_SECRET
        )
    );
    // secret 篡改即变（尾拼 secret，替换后摘要必变）
    assert_ne!(
        ele_sign(GOLDEN_URL, &GOLDEN_REQUEST_PARAMS, GOLDEN_SECRET),
        ele_sign(
            GOLDEN_URL,
            &GOLDEN_REQUEST_PARAMS,
            "4d31ba58fd73c71db697ab5e4946d52X"
        )
    );
}

#[test]
fn timestamp_is_unix_seconds_string() {
    // 官方 §4.1/§6 口径：timestamp 为调用时 unix 秒（示例 1374908054 即十进制秒）
    assert_eq!(ele_timestamp(0), "0");
    assert_eq!(ele_timestamp(1_374_908_054), "1374908054");
}

#[test]
fn plaintext_routing_detects_json_vs_h5_form() {
    // `{` 开头 = v2 JSON 推送；否则 = H5 表单推送（§5.6 form-urlencoded）
    assert!(is_json_plaintext(GOLDEN_PROBE_PLAINTEXT));
    assert!(is_json_plaintext("  {\"a\":1}"));
    assert!(!is_json_plaintext(GOLDEN_H5_FORM));
}

#[test]
fn message_id_snapshot_follows_order_ids() {
    // JSON 推送快照取 eleme_order_id（§5.2–§5.5 四推送共名），缺失回退 order_id
    assert_eq!(message_id_of(GOLDEN_PROBE_PLAINTEXT), "12637645858619059");
    assert_eq!(message_id_of(r#"{"order_id":"1425223342"}"#), "1425223342");
    // H5 表单推送快照取 order_id（§5.6 字段表）；均缺失不落值
    assert_eq!(message_id_of(GOLDEN_H5_FORM), "12637645858619059");
    assert_eq!(message_id_of("push_action=1&user_id=12345"), "");
}

#[test]
fn sign_params_merges_query_params_with_payload_keys() {
    // 系统参数并入参数集；同名键以明文为准；sig 恒排除（官方「除 sig 外」逐字）
    let pairs = form_pairs(&format!("{GOLDEN_H5_FORM}&sig=stale"));
    let params = sign_params("7284397484", "1374908054", &pairs);
    assert!(params.contains(&("consumer_key".to_string(), "7284397484".to_string())));
    assert!(params.contains(&("timestamp".to_string(), "1374908054".to_string())));
    assert!(params.contains(&("order_id".to_string(), "12637645858619059".to_string())));
    assert!(params.iter().all(|(key, _)| key != "sig"));
    // 明文已带 consumer_key/timestamp 时让位（防重复键破坏排序拼串）
    let with_public = form_pairs("consumer_key=999&timestamp=42&order_id=1");
    let params = sign_params("7284397484", "1374908054", &with_public);
    assert!(params.contains(&("consumer_key".to_string(), "999".to_string())));
    assert!(params.contains(&("timestamp".to_string(), "42".to_string())));
    // JSON 推送传空 kv：仅系统参数参签（§7.7 字段级待核验下的同构口径）
    let params = sign_params("7284397484", "1374908054", &[]);
    assert_eq!(params.len(), 2);
}
