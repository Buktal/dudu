//! 「黄金样本 → 加密 → 验签」链路复算（无需网络）：官方调试向量 A 凭据下，
//! §5.4 官方事件样本（逐字）→ AES 信封（PKCS#7-32 + 包尾 $key）→ sha1 四参
//! URL 签名 → 可独立解回原样本；check_url 握手明文同链路；机器人 sign
//! 官方样例参数复算；加密 success 回包（官方向量 B 密文形态）验签解密。

use crate::connections::wecom::random_16;

use super::*;

#[test]
fn golden_event_sample_encrypts_signs_and_roundtrips() {
    // 黄金样本（§5.4 逐字）→ 加密单字段信封 → URL 三参 sha1 签名 → 解密回原文
    let encrypt = crypto::encrypt_msg(
        GOLDEN_ENCODING_AES_KEY,
        &random_16(),
        GOLDEN_EVENT_PLAINTEXT.as_bytes(),
        GOLDEN_OWNER_KEY,
    )
    .expect("黄金样本应可加密");
    let body = format!(r#"{{"encrypt":"{encrypt}"}}"#);

    // 信封结构：恰好一个 encrypt 字段（官方 §5.10 推送形态）
    let parsed: serde_json::Value = serde_json::from_str(&body).unwrap();
    let object = parsed.as_object().unwrap();
    assert_eq!(object.len(), 1, "加密信封应只有 encrypt 字段");
    assert!(object.contains_key("encrypt"));

    // 验签：签名 = sha1(字典序排序(token, timestamp, nonce, encrypt))，40 位小写 hex
    let signature = crypto::build_signature(GOLDEN_TOKEN, "1445827045067", "nEXhMP4r", &encrypt);
    assert_eq!(signature.len(), 40);
    assert_eq!(
        signature,
        crate::connections::util::sha1_sorted_hex(&[
            GOLDEN_TOKEN,
            "1445827045067",
            "nEXhMP4r",
            encrypt.as_str(),
        ])
    );

    // 独立解回官方样本逐字 + 包尾 $key 校验（$key = 企微实现字段名 receiveid）
    let decrypted = crypto::decrypt_msg(GOLDEN_ENCODING_AES_KEY, &encrypt).unwrap();
    assert_eq!(decrypted.msg, GOLDEN_EVENT_PLAINTEXT.as_bytes());
    assert_eq!(decrypted.receiveid, GOLDEN_OWNER_KEY);
}

#[test]
fn golden_check_url_handshake_follows_official_envelope_path() {
    // check_url 握手明文（§5.6 解密后逐字）→ 同一加密/验签链路（官方调试
    // 向量凭据）；固定随机数下加密输出可独立解密回原文
    let encrypt = crypto::encrypt_msg(
        GOLDEN_ENCODING_AES_KEY,
        &[7u8; 16],
        HANDSHAKE_PLAINTEXT.as_bytes(),
        GOLDEN_OWNER_KEY,
    )
    .unwrap();

    let decrypted = crypto::decrypt_msg(GOLDEN_ENCODING_AES_KEY, &encrypt).unwrap();
    assert_eq!(decrypted.msg, HANDSHAKE_PLAINTEXT.as_bytes());
    assert_eq!(decrypted.receiveid, GOLDEN_OWNER_KEY);
    // 签名对信封可复算
    let signature =
        crypto::build_signature(GOLDEN_TOKEN, "1783610513", "w2WPvWxxxxGOmIB", &encrypt);
    assert_eq!(
        signature,
        crate::connections::util::sha1_sorted_hex(&[
            GOLDEN_TOKEN,
            "1783610513",
            "w2WPvWxxxxGOmIB",
            encrypt.as_str(),
        ])
    );
}

#[test]
fn golden_bot_sign_recomputes_official_sample_parameters() {
    // §5.7 官方 Java 样例参数：timestamp=1577262236757 + appSecret
    // "this is a secret"；期望值 Node crypto 交叉复算（HMAC 原语 RFC 4231 独立验收）
    assert_eq!(
        bot::build_sign(GOLDEN_APP_SECRET, "1577262236757"),
        "DJrE6qdyVGCQz9z5r2MDuNcNAhwYnuAkyj13cx169CA="
    );
}

#[test]
fn golden_success_reply_envelope_verifies_and_decrypts() {
    // 官方向量 B：enc("success") 回包密文（§5.10 FAQ）经回包验签解密入口
    // → 字符串 success；签名错、缺字段、非 JSON 均拒绝
    let reply = format!(
        r#"{{"msg_signature":"{}","timeStamp":"{}","nonce":"{}","encrypt":"{}"}}"#,
        "9a95a004dd16f5c307e849b994173f76aa26e5eb",
        "1614767836",
        "A7Co0cJLMzIDtMMI",
        "YvkvaGe4hQxd3VxRmEty0dVlnCOAqwf56xwTRHDHoOURqhalbmBJQk5FNcRk42Gl5T0YQXZNwpwWSm1xAFJ5ZA=="
    );
    let plaintext = crypto::verify_and_decrypt_reply(
        "123456",
        "1234567890123456789012345678901234567890123",
        &reply,
    )
    .unwrap();
    assert_eq!(plaintext, "success");

    let tampered = reply.replace("9a95a004", "0".repeat(8).as_str());
    assert!(crypto::verify_and_decrypt_reply(
        "123456",
        "1234567890123456789012345678901234567890123",
        &tampered
    )
    .is_err());
}
