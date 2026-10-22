//! 飞书回调加解密原语（事实库 docs/research/channels/feishu.md §4，自包含实现）：
//! - 签名（官方 §4.2）：`X-Lark-Signature = hex(sha256(timestamp + nonce +
//!   encrypt_key + 原始 body 字节))`——body 用原始字节，不反序列化后重算
//! - 事件信封（官方 §4.3）：AES-256-CBC，key = sha256(encrypt_key)（32 字节），
//!   Base64 解码后**前 16 字节为 IV**、余下为密文，PKCS#7-16 补位
//! 与微信族（`wecom::crypto`）的差异全部留在本模块内（ADR-0001）：key 推导
//! （sha256 vs Base64(EncodingAESKey+"=")）、IV 位置（密文头部 vs key 前缀）、
//! 补位块（16 vs 32）。与 HTTP 握手/直发零依赖耦合（消费方只取本模块原语）。

use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use sha2::{Digest, Sha256};

/// AES-256-CBC 编码器（PKCS#7-16 标准 16 字节块补位，与企微的 32 字节块不同）。
type Aes256CbcEnc = cbc::Encryptor<aes::Aes256>;

/// AES-256-CBC 解码器（官方回归向量验收 + 链路测试解密核对）。
type Aes256CbcDec = cbc::Decryptor<aes::Aes256>;

/// 官方签名算法（事实库 §4.2 逐字）：sha256(timestamp + nonce + encrypt_key +
/// body) 输出小写 hex；body 为原始请求字节（本工具直发即前端拼装明文/信封）。
pub fn build_signature(timestamp: &str, nonce: &str, encrypt_key: &str, body: &str) -> String {
    crate::connections::util::sha256_hex(&[
        timestamp.as_bytes(),
        nonce.as_bytes(),
        encrypt_key.as_bytes(),
        body.as_bytes(),
    ])
}

/// AES key 派生（官方 §4.3）：key = sha256(encrypt_key)，32 字节。
pub fn derive_aes_key(encrypt_key: &str) -> Result<[u8; 32], String> {
    Ok(Sha256::digest(encrypt_key.as_bytes()).into())
}

/// 加密事件信封：随机 16B IV（原语单点在 util::random_bytes_16）+
/// PKCS#7-16 填充 → AES-256-CBC → Base64（即 `{"encrypt":"<值>"}` 的字段值，
/// 官方 Python 示例同构）。
pub fn encrypt_event(encrypt_key: &str, plaintext: &[u8]) -> Result<String, String> {
    let iv = crate::connections::util::random_bytes_16();
    encrypt_event_with_iv(encrypt_key, &iv, plaintext)
}

/// 以指定 IV 加密（测试黄金例复算用；线上走 [`encrypt_event`] 随机 IV）。
pub fn encrypt_event_with_iv(
    encrypt_key: &str,
    iv: &[u8; 16],
    plaintext: &[u8],
) -> Result<String, String> {
    let key = derive_aes_key(encrypt_key)?;
    let encryptor = Aes256CbcEnc::new_from_slices(&key, iv)
        .map_err(|err| format!("AES 加密器初始化失败：{err}"))?;
    let encrypted = encryptor
        .encrypt_padded_vec_mut::<Pkcs7>(plaintext)
        .into_iter();
    // 官方解密示例（§4.3）：Base64 解码后前 16 字节为 IV、余下为密文
    let mut data = Vec::with_capacity(16 + plaintext.len() + 16);
    data.extend_from_slice(iv);
    data.extend(encrypted);
    Ok(BASE64.encode(data))
}

/// 解密事件信封：Base64 → 前 16B IV + 密文 → AES-256-CBC 去 PKCS#7 填充
/// （官方回归向量 P37w…（key = test key）→ `hello world`）。
/// mock 只推不收（官方无飞书加密被动回复形态），解密侧仅测试与排障取用。
#[allow(dead_code)]
pub fn decrypt_event(encrypt_key: &str, encrypt: &str) -> Result<Vec<u8>, String> {
    let key = derive_aes_key(encrypt_key)?;
    let data = BASE64
        .decode(encrypt)
        .map_err(|err| format!("密文 Base64 解码失败：{err}"))?;
    if data.len() < 16 {
        return Err(format!(
            "密文长度 {} 不足 16 字节，缺少 IV 段（官方：前 16 字节为 IV）",
            data.len()
        ));
    }
    let (iv, ciphertext) = data.split_at(16);
    let decryptor = Aes256CbcDec::new_from_slices(&key, iv)
        .map_err(|err| format!("AES 解密器初始化失败：{err}"))?;
    decryptor
        .decrypt_padded_vec_mut::<Pkcs7>(ciphertext)
        .map_err(|_| "AES 解密失败：密文长度非 16 字节块整数倍或 PKCS#7 补位非法".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_roundtrips_across_pkcs7_16_boundaries() {
        // 明文长度跨 16 字节块边界两侧（含 0）：整段往返一致
        for len in [0usize, 1, 15, 16, 17, 31, 32, 100, 1000] {
            let plaintext: Vec<u8> = (0..len).map(|i| (i % 251) as u8).collect();
            let encrypt = encrypt_event("round-trip-key", &plaintext).unwrap();
            let decrypted = decrypt_event("round-trip-key", &encrypt).unwrap();
            assert_eq!(decrypted, plaintext, "len={len}");
        }
    }

    #[test]
    fn decrypt_rejects_malformed_ciphertext() {
        // 非 Base64
        assert!(decrypt_event("k", "not-base64!!!").is_err());
        // 合法 Base64 但不足一个 IV 长度
        assert!(decrypt_event("k", &BASE64.encode([0u8; 8])).is_err());
        // 长度非 16 字节块整数倍（IV 后余 5 字节）
        assert!(decrypt_event("k", &BASE64.encode([0u8; 21])).is_err());
    }

    #[test]
    fn decrypt_rejects_wrong_key_or_corrupted_padding() {
        let encrypt = encrypt_event("right-key", b"hello feishu").unwrap();
        // 密钥不同 → 解出垃圾，PKCS#7 校验不过
        assert!(decrypt_event("wrong-key", &encrypt).is_err());
    }
}
