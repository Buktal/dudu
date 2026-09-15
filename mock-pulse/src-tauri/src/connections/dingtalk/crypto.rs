//! 钉钉回调加解密（事实库 docs/research/channels/dingtalk.md §4.1/§5.6/§5.10）：
//! - 验签（§4.1 逐字）：`dev_msg_signature = sha1(sort(token, timestamp, nonce,
//!   msg_encrypt))`，与推送/回包字段比对；原语与企微同族
//!   （util::sha1_sorted_hex），官方调试向量双例验收（本模块测试）
//! - AES（§4.1 逐字）：AESKey = Base64_Decode(EncodingAESKey + "=")，AES-256-CBC，
//!   IV 取 AESKey 前 16 字节，PKCS#7 填充（RFC 2315）——官方调试向量实证
//!   补位值 22/17 > 16，即 32 字节块；密文结构
//!   `encrypt = Base64(AES_Encrypt[random(16B) + msg_len(4B 大端) + msg + $key])`。
//!   与企微官方加密规范全套同算法（wecom::crypto，小红书同例），原语直接
//!   复用（[`decrypt_msg`]/[`encrypt_msg`] re-export）；钉钉语义差异只在包尾
//!   $key（企业内部应用 = Corpid、企业定制应用 = customKey、第三方企业应用
//!   = suiteKey → 连接配置的 owner_key，即企微实现字段名的 receiveid）与
//!   加密 success 回包（§5.6/§5.10），留在本模块

use crate::connections::util::sha1_sorted_hex;

// AES 信封原语与企微全套同算法（key 派生 / PKCS#7-32 补位 / CBC 链 / Base64 /
// rand_msg 拼包解包），直接复用企微实现——重写副本已删除，官方调试向量
// 黄金测试（本模块 tests）锚定复用后行为不变。
pub(crate) use crate::connections::wecom::crypto::{decrypt_msg, encrypt_msg};

/// 官方验签算法（§4.1）：token/timestamp/nonce/msg_encrypt 字典序排序拼接后
/// sha1，40 位小写 hex（官方调试向量：5a65cee… 与 9a95a00… 双例可复算）。
pub fn build_signature(token: &str, timestamp: &str, nonce: &str, msg_encrypt: &str) -> String {
    sha1_sorted_hex(&[token, timestamp, nonce, msg_encrypt])
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

#[cfg(test)]
mod tests {
    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine;

    use crate::connections::wecom::crypto::{
        aes_decrypt, aes_encrypt, derive_aes_key, verify_receiveid,
    };
    use crate::connections::wecom::random_16;

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
        // 补位值 22 > 16，实证 32 字节块（16 字节块实现会误判补位非法）。
        // 包尾 $key 即企微实现字段名的 receiveid（= 连接配置 owner_key）
        let decrypted = decrypt_msg(GOLDEN_A_ENCODING_AES_KEY, GOLDEN_A_ENCRYPT).unwrap();
        assert_eq!(decrypted.msg, GOLDEN_A_PLAINTEXT.as_bytes());
        assert_eq!(decrypted.receiveid, GOLDEN_A_OWNER_KEY);
        assert!(verify_receiveid(&decrypted, GOLDEN_A_OWNER_KEY).is_ok());
        assert!(verify_receiveid(&decrypted, "other_key").is_err());
    }

    #[test]
    fn golden_ciphertext_a_reencrypts_verbatim_with_same_random() {
        // 解密路径已由上例独立验证；取官方密文的 random(16B) 重新加密，
        // 必须逐字节复现官方密文（覆盖 key 派生、PKCS#7-32、CBC 链、Base64）
        let key = derive_aes_key(GOLDEN_A_ENCODING_AES_KEY).unwrap();
        let rand_msg = aes_decrypt(&key, &BASE64.decode(GOLDEN_A_ENCRYPT).unwrap()).unwrap();
        let mut random16 = [0u8; 16];
        random16.copy_from_slice(&rand_msg[..16]);

        let encrypt = encrypt_msg(
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
        assert_eq!(decrypted.receiveid, GOLDEN_B_OWNER_KEY);
    }

    #[test]
    fn golden_ciphertext_b_reencrypts_verbatim_with_same_random() {
        let key = derive_aes_key(GOLDEN_B_ENCODING_AES_KEY).unwrap();
        let rand_msg = aes_decrypt(&key, &BASE64.decode(GOLDEN_B_ENCRYPT).unwrap()).unwrap();
        let mut random16 = [0u8; 16];
        random16.copy_from_slice(&rand_msg[..16]);

        let encrypt = encrypt_msg(
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
            let encrypt =
                encrypt_msg(GOLDEN_A_ENCODING_AES_KEY, &random_16(), &plaintext, "owner").unwrap();
            let decrypted = decrypt_msg(GOLDEN_A_ENCODING_AES_KEY, &encrypt).unwrap();
            assert_eq!(decrypted.msg, plaintext, "len={len}");
            assert_eq!(decrypted.receiveid, "owner", "len={len}");
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
