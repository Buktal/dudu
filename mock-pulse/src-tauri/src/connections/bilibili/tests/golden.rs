//! 签名自反对拍与信封形态（事实库 bilibili.md §4.2/§2.2/§3.2，无需网络）：
//! 官方无公开黄金向量（「签名机制」节正文未取，拼接串为社区 DotnetDemo
//! 自述口径 → 待核验(09-27)）——以「签名→验签」自反 + 篡改必败锚定，
//! HMAC/MD5 原语本身由 util 层 RFC 4231/1321 向量独立验收。

use super::*;

/// 签名头表的官方字段名（§4.2 头表逐字段）按名字典序排列即此序。
const CANONICAL_NAMES: [&str; 6] = [
    "x-bili-accesskeyid",
    "x-bili-content-md5",
    "x-bili-signature-method",
    "x-bili-signature-nonce",
    "x-bili-signature-version",
    "x-bili-timestamp",
];

fn golden_headers(nonce: &str) -> Vec<(&'static str, String)> {
    signing_headers(
        GOLDEN_CLIENT_ID,
        &content_md5(GOLDEN_EVENT_PLAINTEXT),
        "1700000000",
        nonce,
    )
}

#[test]
fn signing_headers_use_official_table_fields_and_values() {
    let headers = golden_headers("nonce-1");
    let names: Vec<&str> = headers.iter().map(|(name, _)| *name).collect();
    assert_eq!(names, CANONICAL_NAMES, "头表字段与官方拼写一致");
    let value_of = |name: &str| {
        headers
            .iter()
            .find(|(key, _)| *key == name)
            .map(|(_, value)| value.as_str())
            .unwrap()
    };
    assert_eq!(value_of("x-bili-accesskeyid"), GOLDEN_CLIENT_ID);
    assert_eq!(
        value_of("x-bili-content-md5"),
        content_md5(GOLDEN_EVENT_PLAINTEXT)
    );
    assert_eq!(value_of("x-bili-signature-method"), SIGNATURE_METHOD);
    assert_eq!(value_of("x-bili-signature-version"), SIGNATURE_VERSION);
    assert_eq!(value_of("x-bili-timestamp"), "1700000000");
}

#[test]
fn signature_and_verify_are_self_reflexive() {
    // 官方无黄金向量 → 「签名→验签」自反：接收侧把收到的 (头名, 头值) 对按
    // 头名字典序排列后取值 \n 连接、HMAC-SHA256(secret) 复算，与 Authorization
    // 一致即合法（排序按头名而非头值——头值乱序不影响拼接串）
    let headers = golden_headers("self-reflexive-nonce");
    let signature = authorization(GOLDEN_APP_SECRET, &headers);
    // 接收侧独立复现：不经 signing_headers，从 (名, 值) 对按名排序复算
    let mut received: Vec<(&str, &str)> =
        headers.iter().map(|(name, value)| (*name, value.as_str())).collect();
    received.sort_by(|left, right| left.0.cmp(right.0));
    let joined: String = received.iter().map(|(_, value)| *value).collect::<Vec<_>>().join("\n");
    let recomputed =
        crate::connections::util::hmac_sha256_hex(GOLDEN_APP_SECRET, &joined);
    assert_eq!(signature, recomputed);
    // 与按拼接串定义直接计算的形态一致（排序后取值 \n 连接）
    assert_eq!(
        signature,
        crate::connections::util::hmac_sha256_hex(
            GOLDEN_APP_SECRET,
            &signature_string(&headers)
        )
    );
}

#[test]
fn signature_string_sorts_by_header_name() {
    let mut headers = golden_headers("orderless-nonce");
    // 打乱输入顺序：拼接串按头名字典序（固定序列）取值，与输入序无关
    headers.reverse();
    assert_eq!(signature_string(&headers), signature_string(&golden_headers("orderless-nonce")));
    // 与固定字段序手工拼接逐字一致
    let headers = golden_headers("orderless-nonce");
    let expected = format!(
        "{}\n{}\n{}\n{}\n{}\n{}",
        GOLDEN_CLIENT_ID,
        content_md5(GOLDEN_EVENT_PLAINTEXT),
        SIGNATURE_METHOD,
        "orderless-nonce",
        SIGNATURE_VERSION,
        "1700000000",
    );
    assert_eq!(signature_string(&headers), expected);
}

#[test]
fn authorization_changes_with_any_tamper() {
    let base = authorization(GOLDEN_APP_SECRET, &golden_headers("tamper-nonce"));
    // 头值被篡改（重序列化改 body → content-md5 变、nonce/时间戳变化）即变
    let tampered_body = signing_headers(
        GOLDEN_CLIENT_ID,
        &content_md5(&format!("{GOLDEN_EVENT_PLAINTEXT} ")),
        "1700000000",
        "tamper-nonce",
    );
    assert_ne!(authorization(GOLDEN_APP_SECRET, &tampered_body), base);
    // 密钥被篡改即变
    assert_ne!(
        authorization("bilibili-open-platform-secree", &golden_headers("tamper-nonce")),
        base
    );
    // accesskeyid 被替换即变
    let other_client = signing_headers(
        "395c8275dd674f18",
        &content_md5(GOLDEN_EVENT_PLAINTEXT),
        "1700000000",
        "tamper-nonce",
    );
    assert_ne!(authorization(GOLDEN_APP_SECRET, &other_client), base);
}

#[test]
fn content_md5_follows_official_lowercase_rule() {
    // §4.2 头表逐字「请求体当字符串做 MD5（全小写）」：RFC 1321 向量
    assert_eq!(
        content_md5("abc"),
        "900150983cd24fb0d6963f7d28e17f72"
    );
    // 「GET 或 body 为空时对空字符串求 MD5」：空串向量
    assert_eq!(content_md5(""), "d41d8cd98f00b204e9800998ecf8427e");
}

#[test]
fn timestamp_utc8_formats_official_package_shape() {
    // §2.2 官方包络表：timestamp 为 yyyy-MM-dd HH:mm:ss（UTC+8）字符串——
    // 2021-01-01T04:01:01Z → UTC+8 = 官方样本时刻 2021-01-01 12:01:01
    assert_eq!(timestamp_utc8(1_609_473_661), GOLDEN_TIMESTAMP);
    // epoch 0 → 东八区零点；跨日边界（15:59:59Z → 23:59:59，+1s 进次日）
    assert_eq!(timestamp_utc8(0), "1970-01-01 08:00:00");
    assert_eq!(timestamp_utc8(1_609_516_799), "2021-01-01 23:59:59");
    assert_eq!(timestamp_utc8(1_609_516_800), "2021-01-02 00:00:00");
}

#[test]
fn probe_envelope_matches_official_sample_shape() {
    // §3.2 镜像样本键序 event → content → timestamp；data 为 JSON number
    let parsed: serde_json::Value =
        serde_json::from_str(&probe_envelope(GOLDEN_PROBE_DATA, GOLDEN_TIMESTAMP)).unwrap();
    let keys: Vec<&str> = parsed
        .as_object()
        .unwrap()
        .keys()
        .map(String::as_str)
        .collect();
    assert_eq!(keys, ["event", "content", "timestamp"]);
    assert_eq!(parsed["event"], "verify_webhooks");
    assert_eq!(parsed["content"]["data"], GOLDEN_PROBE_DATA);
    assert!(parsed["content"]["data"].is_number(), "官方样本 data 为 JSON number");
    assert_eq!(parsed["timestamp"], GOLDEN_TIMESTAMP);
}

#[test]
fn random_probe_data_is_ten_digit_and_varies() {
    // 同形态生成：10 位整数、首位非零（样本 1371848576 量级）
    for _ in 0..32 {
        let data = random_probe_data();
        assert!(
            (1_000_000_000..=9_999_999_999).contains(&data),
            "data 应为 10 位整数：{data}"
        );
    }
    // 随机性：多次生成不恒等
    let first = random_probe_data();
    assert!(
        (0..8).any(|_| random_probe_data() != first),
        "data 应随请求随机生成"
    );
}
