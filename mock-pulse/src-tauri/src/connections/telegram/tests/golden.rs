//! secret_token 边界与 Update 形态（事实库 telegram.md §4.1/§2.1/§5.2，无需
//! 网络）：恒等头名官方拼写锚定、1–256 字符与字符集边界（1/256 过、空/257/
//! 非法字符拒）、官方探针样本逐字形态与 update_id 快照取值。

use super::*;

#[test]
fn secret_token_header_uses_official_spelling() {
    // 官方 §4.1 逐字（setWebhook.secret_token 行）：头名拼写原样，不做大小写改写
    assert_eq!(SECRET_TOKEN_HEADER, "X-Telegram-Bot-Api-Secret-Token");
}

#[test]
fn secret_token_valid_accepts_full_charset_within_bounds() {
    // 下边界：1 字符合法（官方 1–256 闭区间）
    assert!(secret_token_valid("a"));
    assert!(secret_token_valid("0"));
    assert!(secret_token_valid("_"));
    assert!(secret_token_valid("-"));
    // 上边界：恰 256 字符合法（A-Za-z0-9_- 全字符集覆盖）
    let charset = "Aa0_-";
    let token: String = (0..256)
        .map(|index| charset.as_bytes()[index % charset.len()] as char)
        .collect();
    assert_eq!(token.len(), 256);
    assert!(secret_token_valid(&token));
    // 常规形态（字母数字下划线连字符混合）
    assert!(secret_token_valid(GOLDEN_SECRET_TOKEN));
}

#[test]
fn secret_token_valid_rejects_empty_overlong_and_foreign_chars() {
    // 缺失（0 字符，官方下界 1）
    assert!(!secret_token_valid(""));
    // 超边界：257 字符拒绝（越限 token 真实 setWebhook 配不出来）
    assert!(!secret_token_valid(&"a".repeat(257)));
    assert!(!secret_token_valid(&"a".repeat(1024)));
    // 非法字符：空格/加号/等号/冒号/点/斜杠均不在 A-Za-z0-9_- 内
    for bad in ["bad token", "a+b", "a=b", "a:b", "a.b", "a/b", "药"] {
        assert!(!secret_token_valid(bad), "{bad:?} 应拒绝");
    }
}

#[test]
fn golden_probe_plaintext_matches_official_sample() {
    // §5.2 官方自测样本逐字：update_id 10000 + message（私聊文本 /start）
    let parsed: serde_json::Value = serde_json::from_str(GOLDEN_PROBE_PLAINTEXT).unwrap();
    assert_eq!(parsed["update_id"], 10000);
    assert!(
        parsed["update_id"].is_number(),
        "官方样本 update_id 为 JSON number"
    );
    assert_eq!(parsed["message"]["date"], 1441645532);
    assert_eq!(parsed["message"]["message_id"], 1365);
    assert_eq!(parsed["message"]["text"], "/start");
    let chat = &parsed["message"]["chat"];
    assert_eq!(chat["last_name"], "Test Lastname");
    assert_eq!(chat["id"], 1111111);
    assert_eq!(chat["type"], "private");
    assert_eq!(chat["first_name"], "Test Firstname");
    assert_eq!(chat["username"], "Testusername");
    let from = &parsed["message"]["from"];
    assert_eq!(from["id"], 1111111);
    assert_eq!(from["first_name"], "Test Firstname");
    // 一 Update 至多一个事件字段（§2.1）：顶层仅 update_id + message
    let top = parsed.as_object().unwrap();
    assert_eq!(top.len(), 2);
    assert!(top.contains_key("update_id") && top.contains_key("message"));
    // 官方原文排版逐字保留（含 `"type": "private"` 冒号后空格与缩进）
    assert!(GOLDEN_PROBE_PLAINTEXT.contains("\"type\": \"private\""));
    assert!(GOLDEN_PROBE_PLAINTEXT.starts_with("{\n\"update_id\":10000,"));
}

#[test]
fn update_id_snapshot_follows_dedup_semantics() {
    // 数字形态（官方样本形态）取十进制串
    assert_eq!(update_id_of(GOLDEN_PROBE_PLAINTEXT), "10000");
    assert_eq!(update_id_of(GOLDEN_CALLBACK_PLAINTEXT), "10000");
    // 字符串形态原样（api#update 仅口径 Integer，容错接收侧变体）
    assert_eq!(
        update_id_of(r#"{"update_id":"100234","message":{}}"#),
        "100234"
    );
    // 缺失/非标量/非 JSON 不落值
    assert_eq!(update_id_of(r#"{"message":{}}"#), "");
    assert_eq!(update_id_of(r#"{"update_id":null}"#), "");
    assert_eq!(update_id_of("not-json"), "");
}
