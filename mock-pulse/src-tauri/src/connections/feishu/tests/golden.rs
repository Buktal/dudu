//! 官方向量复算（无需网络）：官方加密回归向量 P37w…→hello world（§4.3）、
//! 同 IV 重加密回官方密文、AES key 派生 sha256 向量（Node crypto 交叉复算）、
//! X-Lark-Signature 向量（§4.2 算法 + Node 交叉复算），以及
//! 「黄金事件样本 → AES 信封 → 验签」全链路（§5.4 样本逐字）。

use super::*;
use crate::connections::util::sha256_hex;

#[test]
fn golden_regression_ciphertext_decrypts_to_hello_world() {
    // 官方 §4.3 回归向量：AESCipher("test key").decrypt_string("P37w…") = "hello world"
    let decrypted = crypto::decrypt_event(GOLDEN_ENCRYPT_KEY, GOLDEN_ENCRYPT).unwrap();
    assert_eq!(decrypted, GOLDEN_PLAINTEXT.as_bytes());
}

#[test]
fn golden_ciphertext_reencrypts_verbatim_with_same_iv() {
    // 解密路径已由上例独立验证；取官方密文的 IV（解码后前 16B），用同 IV
    // 重新加密必须逐字节复现官方密文（覆盖 sha256 key 派生、CBC 链、PKCS#7-16、
    // Base64 全链路）。
    use base64::Engine;
    let decoded = base64::engine::general_purpose::STANDARD
        .decode(GOLDEN_ENCRYPT)
        .unwrap();
    let mut iv = [0u8; 16];
    iv.copy_from_slice(&decoded[..16]);

    let encrypt =
        crypto::encrypt_event_with_iv(GOLDEN_ENCRYPT_KEY, &iv, GOLDEN_PLAINTEXT.as_bytes())
            .unwrap();

    assert_eq!(encrypt, GOLDEN_ENCRYPT);
}

#[test]
fn golden_aes_key_derivation_matches_sha256_vector() {
    // 官方 §4.3：key = sha256(encrypt_key)；向量 Node crypto 交叉复算
    let key = crypto::derive_aes_key(GOLDEN_ENCRYPT_KEY).unwrap();
    assert_eq!(hex::encode(key), GOLDEN_AES_KEY_HEX);
}

#[test]
fn golden_signature_recomputes_official_algorithm_vector() {
    // 官方 §4.2：sha256(timestamp + nonce + encrypt_key + 原始 body 字节) 小写 hex；
    // 向量 Node crypto 交叉复算
    let signature = crypto::build_signature(
        GOLDEN_SIGNATURE_TIMESTAMP,
        GOLDEN_SIGNATURE_NONCE,
        GOLDEN_ENCRYPT_KEY,
        GOLDEN_SIGNATURE_BODY,
    );
    assert_eq!(signature, GOLDEN_SIGNATURE);
}

#[test]
fn golden_event_sample_encrypts_to_envelope_and_signs_body() {
    // 「黄金样本 → AES → 验签」链路：§5.4 官方事件样本（逐字）→ 加密单字段
    // 信封 → 对信封原始字节签名 → 信封可独立解回原样本。
    let encrypt = crypto::encrypt_event(GOLDEN_ENCRYPT_KEY, GOLDEN_EVENT_PLAINTEXT.as_bytes())
        .expect("黄金样本应可加密");
    let body = format!(r#"{{"encrypt":"{encrypt}"}}"#);

    // 信封结构：恰好一个 encrypt 字段（官方 §4.3 加密信封口径）
    let parsed: serde_json::Value = serde_json::from_str(&body).unwrap();
    let object = parsed.as_object().unwrap();
    assert_eq!(object.len(), 1, "加密信封应只有 encrypt 字段");
    assert!(object.contains_key("encrypt"));

    // 验签：签名头可由 util sha256（FIPS 向量独立验证）对原始 body 复算
    let signature = crypto::build_signature(
        GOLDEN_SIGNATURE_TIMESTAMP,
        GOLDEN_SIGNATURE_NONCE,
        GOLDEN_ENCRYPT_KEY,
        &body,
    );
    assert_eq!(
        signature,
        sha256_hex(&[
            GOLDEN_SIGNATURE_TIMESTAMP.as_bytes(),
            GOLDEN_SIGNATURE_NONCE.as_bytes(),
            GOLDEN_ENCRYPT_KEY.as_bytes(),
            body.as_bytes(),
        ])
    );

    // 解密回官方样本逐字
    let decrypted = crypto::decrypt_event(GOLDEN_ENCRYPT_KEY, &encrypt).unwrap();
    assert_eq!(decrypted, GOLDEN_EVENT_PLAINTEXT.as_bytes());
}
