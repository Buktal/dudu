//! 钉钉回调加解密原语（事实库 docs/research/channels/dingtalk.md §4.1/§5.6/§5.10，
//! 自包含实现，与微信族同源算法但独立成模块——ADR-0001 渠道差异不外溢）：
//! - 验签（§4.1 逐字）：`dev_msg_signature = sha1(sort(token, timestamp, nonce,
//!   msg_encrypt))`，与推送/回包字段比对；原语与企微/抖音服务商同族
//!   （util::sha1_sorted_hex），官方调试向量双例验收（本模块测试）
//! - AES（§4.1 逐字）：AESKey = Base64_Decode(EncodingAESKey + "=")，AES-256-CBC，
//!   IV 取 AESKey 前 16 字节，PKCS#7 填充（RFC 2315）——官方调试向量实证
//!   补位值 22/17 > 16，即 32 字节块（同企微族），16 字节块会误判补位非法
//! - 密文结构（§4.1 逐字）：`encrypt = Base64(AES_Encrypt[random(16B) +
//!   msg_len(4B 大端) + msg + $key])`；$key 对照表：企业内部应用 = Corpid、
//!   企业定制应用 = customKey、第三方企业应用 = suiteKey → 连接配置的 owner_key
//! - 加密 success 回包（§5.6/§5.10）：目标须回
//!   `{"msg_signature","timeStamp","nonce","encrypt":enc("success")}`，
//!   解密明文即字符串 success

use aes::cipher::{block_padding::NoPadding, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig};
use base64::Engine;

/// 钉钉 Base64 解码引擎：43 位 EncodingAESKey + "=" 的末字符带悬空位，
/// 官方算法按宽松解码处理（canonical 严格模式会拒），故解码走此引擎。
const BASE64_LENIENT: GeneralPurpose = GeneralPurpose::new(
    &base64::alphabet::STANDARD,
    GeneralPurposeConfig::new()
        .with_decode_padding_mode(DecodePaddingMode::Indifferent)
        .with_decode_allow_trailing_bits(true),
);

/// AES-256-CBC 编码器（底层块运算；补位按 32 字节块自实现，故用 NoPadding）。
type Aes256CbcEnc = cbc::Encryptor<aes::Aes256>;

/// AES-256-CBC 解码器（官方调试向量验收 + 加密 success 回包解密）。
type Aes256CbcDec = cbc::Decryptor<aes::Aes256>;

/// 补位块大小：官方调试向量实证 32 字节（PKCS#7/RFC 2315 语义）。
const PAD_BLOCK: usize = 32;

/// 官方验签算法（§4.1）：token/timestamp/nonce/msg_encrypt 字典序排序拼接后
/// sha1，40 位小写 hex（官方调试向量：5a65cee… 与 9a95a00… 双例可复算）。
pub fn build_signature(token: &str, timestamp: &str, nonce: &str, msg_encrypt: &str) -> String {
    crate::connections::util::sha1_sorted_hex(&[token, timestamp, nonce, msg_encrypt])
}

/// 从 43 位 EncodingAESKey 派生 32 字节 AESKey：Base64_Decode(key + "=")。
pub fn derive_aes_key(encoding_aes_key: &str) -> Result<[u8; 32], String> {
    let decoded = BASE64_LENIENT
        .decode(format!("{encoding_aes_key}="))
        .map_err(|err| format!("EncodingAESKey 无法解码为 AESKey：{err}"))?;
    decoded.try_into().map_err(|decoded: Vec<u8>| {
        format!(
            "AESKey 应为 32 字节，实际 {} 字节（EncodingAESKey 需为 43 位）",
            decoded.len()
        )
    })
}

/// PKCS#7 去补位：以 32 字节块为单位（补位值 1..=32，整段同值）。
fn pkcs7_unpad_32(data: &[u8]) -> Result<&[u8], String> {
    let Some((&last, _)) = data.split_last() else {
        return Err("解密结果为空，无法去补位".into());
    };
    let pad_len = last as usize;
    let valid = (1..=PAD_BLOCK).contains(&pad_len)
        && pad_len <= data.len()
        && data[data.len() - pad_len..].iter().all(|&b| b == last);
    if !valid {
        return Err(format!("PKCS#7 补位非法（末字节 0x{last:02x}）"));
    }
    Ok(&data[..data.len() - pad_len])
}

/// AES-256-CBC 解密：IV = key 前 16 字节，密文须为 16 字节块整数倍，
/// 解出后按 32 字节块 PKCS#7 去补位。
fn aes_decrypt(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    let decryptor = Aes256CbcDec::new_from_slices(key, &key[..16])
        .map_err(|err| format!("AES 解密器初始化失败：{err}"))?;
    let mut buf = data.to_vec();
    let raw = decryptor
        .decrypt_padded_mut::<NoPadding>(&mut buf)
        .map_err(|_| format!("密文长度 {} 不是 16 字节块的整数倍", data.len()))?;
    pkcs7_unpad_32(raw)
        .map_err(|err| format!("AES 解密失败：{err}"))
        .map(|slice| slice.to_vec())
}

/// PKCS#7 补位：以 32 字节块为单位，补位值 1..=32，整段同值。
fn pkcs7_pad_32(data: &[u8]) -> Vec<u8> {
    let pad_len = PAD_BLOCK - (data.len() % PAD_BLOCK);
    let mut padded = data.to_vec();
    padded.resize(data.len() + pad_len, pad_len as u8);
    padded
}

/// AES-256-CBC 加密：先按 32 字节块 PKCS#7 补位，IV 取 key 前 16 字节。
fn aes_encrypt(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, String> {
    let encryptor = Aes256CbcEnc::new_from_slices(key, &key[..16])
        .map_err(|err| format!("AES 加密器初始化失败：{err}"))?;
    let mut buf = pkcs7_pad_32(data);
    let msg_len = buf.len();
    let encrypted = encryptor
        .encrypt_padded_mut::<NoPadding>(&mut buf, msg_len)
        .map_err(|_| "明文补位后不是 16 字节块的整数倍".to_string())?;
    Ok(encrypted.to_vec())
}

/// 拼加密明文结构（§4.1 逐字）：random(16B) + msg_len(4B 大端) + msg + $key。
fn build_rand_msg(random16: &[u8; 16], msg: &[u8], owner_key: &str) -> Vec<u8> {
    let mut rand_msg = Vec::with_capacity(16 + 4 + msg.len() + owner_key.len());
    rand_msg.extend_from_slice(random16);
    rand_msg.extend_from_slice(&(msg.len() as u32).to_be_bytes());
    rand_msg.extend_from_slice(msg);
    rand_msg.extend_from_slice(owner_key.as_bytes());
    rand_msg
}

/// 加密事件明文（§4.1）：拼包 → AES → Base64，即推送信封 `{"encrypt":"…"}` 的
/// 字段值（线上走 [`encrypt_event`] 随机 16B；测试黄金链路用指定随机数复算）。
pub fn encrypt_event_with_random(
    encoding_aes_key: &str,
    random16: &[u8; 16],
    plaintext: &[u8],
    owner_key: &str,
) -> Result<String, String> {
    let key = derive_aes_key(encoding_aes_key)?;
    let rand_msg = build_rand_msg(random16, plaintext, owner_key);
    let encrypted = aes_encrypt(&key, &rand_msg)?;
    Ok(BASE64.encode(encrypted))
}

/// 加密事件明文（线上入口）：随机 16B + PKCS#7-32 → AES-256-CBC → Base64。
pub fn encrypt_event(
    encoding_aes_key: &str,
    plaintext: &[u8],
    owner_key: &str,
) -> Result<String, String> {
    encrypt_event_with_random(encoding_aes_key, &random16(), plaintext, owner_key)
}

/// 解密结果：明文字节 + 尾部 $key（企业内部=Corpid / 定制=customKey / 第三方=suiteKey）。
#[derive(Clone, Debug, PartialEq)]
pub struct DecryptedMsg {
    pub msg: Vec<u8>,
    pub owner_key: String,
}

/// 解密 encrypt（§4.1 逆拼包）：Base64 → AES 解密 → 去 16 随机字节 → 读
/// 4 字节大端 msg_len → 截 msg → 余下为 $key。
pub fn decrypt_msg(encoding_aes_key: &str, msg_encrypt: &str) -> Result<DecryptedMsg, String> {
    let key = derive_aes_key(encoding_aes_key)?;
    let raw = BASE64
        .decode(msg_encrypt)
        .map_err(|err| format!("密文 Base64 解码失败：{err}"))?;
    let unpadded = aes_decrypt(&key, &raw)?;
    if unpadded.len() < 16 + 4 {
        return Err("解密结果过短，缺少 random(16B) + msg_len(4B) 结构".into());
    }
    let msg_len =
        u32::from_be_bytes([unpadded[16], unpadded[17], unpadded[18], unpadded[19]]) as usize;
    if 16 + 4 + msg_len > unpadded.len() {
        return Err(format!(
            "msg_len（{msg_len}）超出解密结果长度（{}）",
            unpadded.len()
        ));
    }
    let msg = unpadded[20..20 + msg_len].to_vec();
    let owner_key = String::from_utf8_lossy(&unpadded[20 + msg_len..]).to_string();
    Ok(DecryptedMsg { msg, owner_key })
}

/// 校验解密包尾部的 $key（企业内部=Corpid / 第三方=suiteKey，连接配置的
/// owner_key）。mock 只推不收（推送侧 $key 由本方封装时写入），解密侧仅
/// 测试与排障取用。
#[allow(dead_code)]
pub fn verify_owner_key(decrypted: &DecryptedMsg, expect: &str) -> Result<(), String> {
    if decrypted.owner_key == expect {
        Ok(())
    } else {
        Err(format!(
            "$key 校验错误：期望 {expect}，实际 {}",
            decrypted.owner_key
        ))
    }
}

/// 校验并解密加密 success 回包（§5.6/§5.10）：body 形如
/// `{"msg_signature","timeStamp","nonce","encrypt"}`——先按 sha1 四参复算
/// msg_signature（防伪造/配置错），再用连接配置的 EncodingAESKey 解密出明文
/// （正常为字符串 success）。
pub fn verify_and_decrypt_reply(
    token: &str,
    encoding_aes_key: &str,
    response_body: &str,
) -> Result<String, String> {
    let parsed: serde_json::Value = serde_json::from_str(response_body)
        .map_err(|_| format!("回包不是合法 JSON：{response_body}"))?;
    let signature = parsed
        .get("msg_signature")
        .and_then(|value| value.as_str())
        .ok_or_else(|| format!("回包缺少 msg_signature 字段：{response_body}"))?;
    let timestamp = parsed
        .get("timeStamp")
        .and_then(|value| value.as_str())
        .ok_or_else(|| format!("回包缺少 timeStamp 字段：{response_body}"))?;
    let nonce = parsed
        .get("nonce")
        .and_then(|value| value.as_str())
        .ok_or_else(|| format!("回包缺少 nonce 字段：{response_body}"))?;
    let encrypt = parsed
        .get("encrypt")
        .and_then(|value| value.as_str())
        .ok_or_else(|| format!("回包缺少 encrypt 字段：{response_body}"))?;
    let expected = build_signature(token, timestamp, nonce, encrypt);
    if expected != signature {
        return Err(format!(
            "回包 msg_signature 验签失败：期望 {expected}，实际 {signature}"
        ));
    }
    decrypt_msg(encoding_aes_key, encrypt)
        .map(|decrypted| String::from_utf8_lossy(&decrypted.msg).to_string())
}

/// 随机 16B：uuid v4 字节（依赖内已有的随机源，不额外引随机库）。
fn random16() -> [u8; 16] {
    *uuid::Uuid::new_v4().as_bytes()
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---- 官方调试向量（事实库 §4.1 逐字，Node crypto 交叉复算链路） ----

    /// 向量 A（加解密页）：TOKEN=123456、ENCODING_AES_KEY=4g5j…s3ij、
    /// KEY=suite4xxxxxxxxxxxxxxx；URL 参 signature/timestamp/nonce + POST 密文。
    const GOLDEN_A_TOKEN: &str = "123456";
    const GOLDEN_A_TIMESTAMP: &str = "1445827045067";
    const GOLDEN_A_NONCE: &str = "nEXhMP4r";
    const GOLDEN_A_SIGNATURE: &str = "5a65ceeef9aab2d149439f82dc191dd6c5cbe2c0";
    const GOLDEN_A_ENCODING_AES_KEY: &str = "4g5j64qlyl3zvetqxz5jiocdr586fn2zvjpa8zls3ij";
    const GOLDEN_A_OWNER_KEY: &str = "suite4xxxxxxxxxxxxxxx";
    const GOLDEN_A_ENCRYPT: &str = "1a3NBxmCFwkCJvfoQ7WhJHB+iX3qHPsc9JbaDznE1i03peOk1LaOQoRz3+nlyGNhwmwJ3vDMG+OzrHMeiZI7gTRWVdUBmfxjZ8Ej23JVYa9VrYeJ5as7XM/ZpulX8NEQis44w53h1qAgnC3PRzM7Zc/D6Ibr0rgUathB6zRHP8PYrfgnNOS9PhSBdHlegK+AGGanfwjXuQ9+0pZcy0w9lQ==";
    /// 向量 A 解密出的明文（官方未给，经官方算法可复算；即 check_create_suite_url
    /// 握手事件，事实库 §5.6 事件名同族）。
    const GOLDEN_A_PLAINTEXT: &str = r#"{"EventType":"check_create_suite_url","Random":"LPIdSnlF","TestSuiteKey":"suite4xxxxxxxxxxxxxxx"}"#;

    /// 向量 B（新 HTTP 页 FAQ）：DingTalkEncryptor("123456","1234…0123",
    /// "dingsnotzck6pm5veliw") + getDecryptMsg 四参（§5.10 逐字）。
    const GOLDEN_B_TOKEN: &str = "123456";
    const GOLDEN_B_TIMESTAMP: &str = "1614767836";
    const GOLDEN_B_NONCE: &str = "A7Co0cJLMzIDtMMI";
    const GOLDEN_B_SIGNATURE: &str = "9a95a004dd16f5c307e849b994173f76aa26e5eb";
    const GOLDEN_B_ENCODING_AES_KEY: &str = "1234567890123456789012345678901234567890123";
    const GOLDEN_B_OWNER_KEY: &str = "dingsnotzck6pm5veliw";
    const GOLDEN_B_ENCRYPT: &str =
        "YvkvaGe4hQxd3VxRmEty0dVlnCOAqwf56xwTRHDHoOURqhalbmBJQk5FNcRk42Gl5T0YQXZNwpwWSm1xAFJ5ZA==";
    /// 向量 B 解密出的明文（即加密 success 回包的密文形态）。
    const GOLDEN_B_PLAINTEXT: &str = "success";

    #[test]
    fn golden_signature_recomputes_both_official_vectors() {
        // sha1(字典序排序(token, timestamp, nonce, encrypt))——官方调试向量双例
        assert_eq!(
            build_signature(
                GOLDEN_A_TOKEN,
                GOLDEN_A_TIMESTAMP,
                GOLDEN_A_NONCE,
                GOLDEN_A_ENCRYPT
            ),
            GOLDEN_A_SIGNATURE
        );
        assert_eq!(
            build_signature(
                GOLDEN_B_TOKEN,
                GOLDEN_B_TIMESTAMP,
                GOLDEN_B_NONCE,
                GOLDEN_B_ENCRYPT
            ),
            GOLDEN_B_SIGNATURE
        );
    }

    #[test]
    fn golden_ciphertext_a_decrypts_to_handshake_plaintext() {
        // 官方向量 A：密文 → 明文（check_create_suite_url 握手）+ 包尾 $key；
        // 补位值 22 > 16，实证 32 字节块（16 字节块实现会误判补位非法）
        let decrypted = decrypt_msg(GOLDEN_A_ENCODING_AES_KEY, GOLDEN_A_ENCRYPT).unwrap();
        assert_eq!(decrypted.msg, GOLDEN_A_PLAINTEXT.as_bytes());
        assert_eq!(decrypted.owner_key, GOLDEN_A_OWNER_KEY);
        assert!(verify_owner_key(&decrypted, GOLDEN_A_OWNER_KEY).is_ok());
        assert!(verify_owner_key(&decrypted, "other_key").is_err());
    }

    #[test]
    fn golden_ciphertext_a_reencrypts_verbatim_with_same_random() {
        // 解密路径已由上例独立验证；取官方密文的 random(16B) 重新加密，
        // 必须逐字节复现官方密文（覆盖 key 派生、PKCS#7-32、CBC 链、Base64）
        let key = derive_aes_key(GOLDEN_A_ENCODING_AES_KEY).unwrap();
        let mut buf = BASE64.decode(GOLDEN_A_ENCRYPT).unwrap();
        let decryptor = Aes256CbcDec::new_from_slices(&key, &key[..16]).unwrap();
        let raw = decryptor.decrypt_padded_mut::<NoPadding>(&mut buf).unwrap();
        let mut random16 = [0u8; 16];
        random16.copy_from_slice(&raw[..16]);

        let encrypt = encrypt_event_with_random(
            GOLDEN_A_ENCODING_AES_KEY,
            &random16,
            GOLDEN_A_PLAINTEXT.as_bytes(),
            GOLDEN_A_OWNER_KEY,
        )
        .unwrap();

        assert_eq!(encrypt, GOLDEN_A_ENCRYPT);
    }

    #[test]
    fn golden_ciphertext_b_decrypts_to_success_reply() {
        // 官方向量 B（FAQ）：即 enc("success") 加密 success 回包的密文形态
        let decrypted = decrypt_msg(GOLDEN_B_ENCODING_AES_KEY, GOLDEN_B_ENCRYPT).unwrap();
        assert_eq!(decrypted.msg, GOLDEN_B_PLAINTEXT.as_bytes());
        assert_eq!(decrypted.owner_key, GOLDEN_B_OWNER_KEY);
    }

    #[test]
    fn golden_ciphertext_b_reencrypts_verbatim_with_same_random() {
        let key = derive_aes_key(GOLDEN_B_ENCODING_AES_KEY).unwrap();
        let mut buf = BASE64.decode(GOLDEN_B_ENCRYPT).unwrap();
        let decryptor = Aes256CbcDec::new_from_slices(&key, &key[..16]).unwrap();
        let raw = decryptor.decrypt_padded_mut::<NoPadding>(&mut buf).unwrap();
        let mut random16 = [0u8; 16];
        random16.copy_from_slice(&raw[..16]);

        let encrypt = encrypt_event_with_random(
            GOLDEN_B_ENCODING_AES_KEY,
            &random16,
            GOLDEN_B_PLAINTEXT.as_bytes(),
            GOLDEN_B_OWNER_KEY,
        )
        .unwrap();

        assert_eq!(encrypt, GOLDEN_B_ENCRYPT);
    }

    #[test]
    fn encrypt_decrypt_roundtrips_across_pkcs7_32_boundaries() {
        // 明文长度跨 32 字节块边界两侧（含 0）：整段往返一致
        for len in [0usize, 1, 15, 16, 17, 31, 32, 33, 100, 1000] {
            let plaintext: Vec<u8> = (0..len).map(|i| (i % 251) as u8).collect();
            let encrypt = encrypt_event(GOLDEN_A_ENCODING_AES_KEY, &plaintext, "owner").unwrap();
            let decrypted = decrypt_msg(GOLDEN_A_ENCODING_AES_KEY, &encrypt).unwrap();
            assert_eq!(decrypted.msg, plaintext, "len={len}");
            assert_eq!(decrypted.owner_key, "owner", "len={len}");
        }
    }

    #[test]
    fn reply_verification_checks_signature_before_decryption() {
        // 加密 success 回包：验签通过才解密；签名被篡改时拒绝
        let reply = format!(
            r#"{{"msg_signature":"{}","timeStamp":"{}","nonce":"{}","encrypt":"{}"}}"#,
            GOLDEN_B_SIGNATURE, GOLDEN_B_TIMESTAMP, GOLDEN_B_NONCE, GOLDEN_B_ENCRYPT
        );
        let plaintext =
            verify_and_decrypt_reply(GOLDEN_B_TOKEN, GOLDEN_B_ENCODING_AES_KEY, &reply).unwrap();
        assert_eq!(plaintext, GOLDEN_B_PLAINTEXT);

        let tampered = reply.replace(GOLDEN_B_SIGNATURE, "0".repeat(40).as_str());
        assert!(
            verify_and_decrypt_reply(GOLDEN_B_TOKEN, GOLDEN_B_ENCODING_AES_KEY, &tampered).is_err()
        );
        // 缺字段 / 非 JSON
        assert!(verify_and_decrypt_reply(
            GOLDEN_B_TOKEN,
            GOLDEN_B_ENCODING_AES_KEY,
            r#"{"encrypt":"x"}"#
        )
        .is_err());
        assert!(
            verify_and_decrypt_reply(GOLDEN_B_TOKEN, GOLDEN_B_ENCODING_AES_KEY, "not json")
                .is_err()
        );
    }

    #[test]
    fn derive_aes_key_rejects_wrong_shape_keys() {
        // 长度非 43 位（官方：EncodingAESKey 固定 43 字符）
        assert!(derive_aes_key(&GOLDEN_A_ENCODING_AES_KEY[..42]).is_err());
        assert!(derive_aes_key(&format!("{GOLDEN_A_ENCODING_AES_KEY}X")).is_err());
    }

    #[test]
    fn decrypt_rejects_malformed_ciphertext() {
        // 非 Base64 / 长度非 16 字节块整数倍 / 结构损坏
        assert!(decrypt_msg(GOLDEN_A_ENCODING_AES_KEY, "not-base64!!!").is_err());
        assert!(decrypt_msg(GOLDEN_A_ENCODING_AES_KEY, &BASE64.encode([0u8; 20])).is_err());
        let key = derive_aes_key(GOLDEN_A_ENCODING_AES_KEY).unwrap();
        let mut rand_msg = vec![0u8; 16];
        rand_msg.extend_from_slice(&u32::MAX.to_be_bytes());
        let ct = BASE64.encode(aes_encrypt(&key, &rand_msg).unwrap());
        assert!(decrypt_msg(GOLDEN_A_ENCODING_AES_KEY, &ct).is_err());
    }
}
