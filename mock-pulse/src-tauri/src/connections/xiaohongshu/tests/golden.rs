//! 黄金样本 → AES（官方 MsgDecrypt 算例）→ sha1 验签链路（事实库 §11.3，
//! 官方 MsgDecrypt.zip 源码逐字要点，无需网络）：
//! 黄金客服消息样本走完整加密链路后可解密还原（明文结构含尾部 appId）、
//! MsgSignature 四参签名可独立复算、信封四字段形态官方一致。
//! AES 原语本身（密钥派生/IV/PKCS#7-32）与微信族同算法，其正确性由企微
//! 官方 90968 黄金向量（wecom::crypto 测试）锚定，此处锚定小红书侧链路组合。

use crate::connections::wecom::crypto;
use base64::Engine;

use super::*;

#[test]
fn golden_message_encrypts_and_decrypts_with_appid_receiveid() {
    // 官方算法（§11.3）：明文结构 random(16B)+msg_len(4B 大端)+msg+appId，
    // AES-256-CBC（IV=key 前 16B）+ PKCS#7-32 + Base64；解密路径逐字节还原
    // 黄金样本，尾部 receiveid = AppId（官方 MsgDecrypt 的明文尾部语义）
    let random16 = [0x42u8; 16];
    let encrypt = crypto::encrypt_msg(
        GOLDEN_ENCODING_AES_KEY,
        &random16,
        GOLDEN_MESSAGE_PLAINTEXT.as_bytes(),
        GOLDEN_APP_ID,
    )
    .unwrap();

    let decrypted = crypto::decrypt_msg(GOLDEN_ENCODING_AES_KEY, &encrypt).unwrap();
    assert_eq!(decrypted.msg, GOLDEN_MESSAGE_PLAINTEXT.as_bytes());
    assert_eq!(decrypted.receiveid, GOLDEN_APP_ID);
    crypto::verify_receiveid(&decrypted, GOLDEN_APP_ID).unwrap();
    assert!(crypto::verify_receiveid(&decrypted, "wx_other_appid").is_err());
}

#[test]
fn golden_ciphertext_reflects_pkcs7_32_and_random_prefix() {
    // 官方 PKCS7Decoder 逐字：pad 取值 1..=32（32 字节块补位，非常见 16）；
    // 解密侧取出的前 16 字节须与加密侧随机数一致（random(16B) 前缀结构）
    let random16 = [0x11u8; 16];
    let encrypt = crypto::encrypt_msg(
        GOLDEN_ENCODING_AES_KEY,
        &random16,
        GOLDEN_MESSAGE_PLAINTEXT.as_bytes(),
        GOLDEN_APP_ID,
    )
    .unwrap();
    let ciphertext = base64::engine::general_purpose::STANDARD
        .decode(&encrypt)
        .unwrap();
    assert_eq!(
        ciphertext.len() % 32,
        0,
        "密文长度应为 32 字节块整数倍（PKCS#7-32）"
    );

    let key = crypto::derive_aes_key(GOLDEN_ENCODING_AES_KEY).unwrap();
    let rand_msg = crypto::aes_decrypt(&key, &ciphertext).unwrap();
    assert_eq!(&rand_msg[..16], &random16, "明文结构以 random(16B) 开头");
}

#[test]
fn golden_msg_signature_recomputes_from_sorted_concatenation() {
    // 官方 MsgSignature.getSignature（§11.3 逐字）：sha1(字典序排序(token,
    // timestamp, nonce, encrypt) 四值拼接) 小写 hex——排序序在测试侧独立复现，
    // 不复用被测实现的排序（避免同函数自证）
    let encrypt = "RypEvHKD8QQKFhvQ6QleEB4J58tiPdvo+rtK1I9qca6aM/wvqnLSV5zEPeusUiX";
    let signature = build_msg_signature(GOLDEN_TOKEN, GOLDEN_TIMESTAMP, GOLDEN_NONCE, encrypt);
    assert_eq!(signature.len(), 40);

    let mut sorted = [GOLDEN_TOKEN, GOLDEN_TIMESTAMP, GOLDEN_NONCE, encrypt];
    sorted.sort_unstable();
    let concatenated: String = sorted.concat();
    assert_eq!(
        crate::connections::util::sha1_hex(&[concatenated.as_str()]),
        signature,
        "四值拼接串直接 sha1 即 MsgSignature"
    );
    // 任一参数变化签名即变化；换序重排仍同一签名（字典序语义）
    assert_ne!(
        build_msg_signature(GOLDEN_TOKEN, GOLDEN_TIMESTAMP, GOLDEN_NONCE, "other"),
        signature
    );
    assert_eq!(
        build_msg_signature(encrypt, GOLDEN_NONCE, GOLDEN_TOKEN, GOLDEN_TIMESTAMP),
        build_msg_signature(GOLDEN_TOKEN, GOLDEN_TIMESTAMP, GOLDEN_NONCE, encrypt)
    );
}

#[test]
fn golden_handshake_signature_follows_three_param_family() {
    // GET 握手（§10.4 逐字）：signature = sha1(sort(token, timestamp, nonce)
    // 三值字典序排序后拼接)——与微信三参家族同式（无 msg_encrypt/echostr 入签）
    let signature = build_callback_signature(GOLDEN_TOKEN, GOLDEN_TIMESTAMP, GOLDEN_NONCE);
    assert_eq!(signature.len(), 40);
    let mut sorted = [GOLDEN_TOKEN, GOLDEN_TIMESTAMP, GOLDEN_NONCE];
    sorted.sort_unstable();
    let concatenated: String = sorted.concat();
    assert_eq!(
        crate::connections::util::sha1_hex(&[concatenated.as_str()]),
        signature
    );
}

#[test]
fn golden_envelope_body_carries_four_official_fields() {
    // 信封（§11.2 官方字段表逐字）：{Nonce, Timestamp, Encrypt, MsgSignature}
    // 在 body 内（与企微 query 参数不同点）；Timestamp 为数字（i32），其余为
    // 字符串；MsgSignature 与 body 内 encrypt 四参可复算
    let push = build_crypto_push(
        GOLDEN_MESSAGE_PLAINTEXT,
        GOLDEN_TOKEN,
        GOLDEN_ENCODING_AES_KEY,
        GOLDEN_APP_ID,
    )
    .unwrap();

    let parsed: serde_json::Value = serde_json::from_str(&push.body).unwrap();
    let fields = parsed.as_object().unwrap();
    let keys: Vec<&str> = fields.keys().map(|key| key.as_str()).collect();
    assert_eq!(
        keys,
        ["Nonce", "Timestamp", "Encrypt", "MsgSignature"],
        "信封字段序按官方字段表"
    );
    assert_eq!(parsed["Nonce"], push.nonce);
    assert_eq!(
        parsed["Timestamp"].as_i64(),
        push.timestamp.parse::<i64>().ok(),
        "Timestamp 为数字（官方 i32）"
    );
    let encrypt = parsed["Encrypt"].as_str().unwrap();
    assert_eq!(
        parsed["MsgSignature"], push.signature,
        "签名快照与信封字段一致"
    );
    assert_eq!(
        build_msg_signature(GOLDEN_TOKEN, &push.timestamp, &push.nonce, encrypt),
        push.signature
    );
    // 信封内密文可独立解密回黄金样本明文（尾部 receiveid = AppId）
    let decrypted = crypto::decrypt_msg(GOLDEN_ENCODING_AES_KEY, encrypt).unwrap();
    assert_eq!(decrypted.msg, GOLDEN_MESSAGE_PLAINTEXT.as_bytes());
    assert_eq!(decrypted.receiveid, GOLDEN_APP_ID);
}
