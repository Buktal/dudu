//! 跨渠道签名/加密原语（util 层单点，各渠道 adapter 复用，不感知渠道语义）：
//! - [`sha1_hex`]：按给定顺序拼接后 sha1 → 40 位小写 hex（抖音 dop/生活服务
//!   X-Douyin-Signature、饿了么 SHA1 五步第 4 步）
//! - [`sha1_sorted_hex`]：字典序排序后拼接 sha1（微信系四值签名家族：
//!   企微 msg_signature、抖音服务商 MsgSignature、钉钉 signature）
//! - [`md5_base64`]：md5 摘要（16 字节）→ 标准 base64（抖音小游戏 x-signature）
//! - [`md5_hex`]：按给定顺序拼接各段后 md5 → 32 位小写 hex（快手 kwaisign）
//! - [`sha256_hex`]：按给定顺序拼接各段（字节串）后 sha256 → 64 位小写 hex
//!   （飞书 X-Lark-Signature：timestamp+nonce+encrypt_key+原始 body 字节）
//! - [`hmac_sha256_base64`]：HMAC-SHA256（RFC 2104，sha2 自实现免新依赖）→
//!   标准 base64（钉钉机器人 sign 头）
//! - [`percent_decode`]/[`form_encode_value`]/[`form_pairs`]/[`strip_sig`]：
//!   form-urlencoded 编解码原语（RFC 3986 非保留字集、大写 hex、+ 还原空格，
//!   与前端 form.ts 单点同一语义；美团/饿了么表单线共用，#45 自美团提炼）
//!
//! 拼接序/密钥来源等渠道语义由各 adapter 组合，本模块只提供纯原语。

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use md5::Md5;
use sha1::{Digest, Sha1};
use sha2::Sha256;

/// 按给定顺序拼接各段后取 sha1，输出 40 位小写 hex。
pub(crate) fn sha1_hex(parts: &[&str]) -> String {
    let mut hasher = Sha1::new();
    for part in parts {
        hasher.update(part.as_bytes());
    }
    hex::encode(hasher.finalize())
}

/// 按给定顺序拼接各段（字节串）后取 sha256，输出 64 位小写 hex。
pub(crate) fn sha256_hex(parts: &[&[u8]]) -> String {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update(part);
    }
    hex::encode(hasher.finalize())
}

/// 各段按字典序排序后拼接取 sha1（微信系四值签名家族的公共形态）。
pub(crate) fn sha1_sorted_hex(values: &[&str]) -> String {
    let mut sorted = values.to_vec();
    sorted.sort_unstable();
    sha1_hex(&sorted)
}

/// md5 摘要（16 字节）→ 标准 base64（抖音小游戏 x-signature，事实库 §4.2）。
pub(crate) fn md5_base64(input: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(input.as_bytes());
    BASE64.encode(hasher.finalize())
}

/// 按给定顺序拼接各段后取 md5，输出 32 位小写 hex（快手 kwaisign，事实库 §4.1）。
pub(crate) fn md5_hex(parts: &[&str]) -> String {
    let mut hasher = Md5::new();
    for part in parts {
        hasher.update(part.as_bytes());
    }
    hex::encode(hasher.finalize())
}

/// HMAC-SHA256（RFC 2104，sha2 块运算自实现：key 过长先散列、ipad/opad 双轮），
/// 输出 32 字节摘要（RFC 4231 向量验收）。
pub(crate) fn hmac_sha256(key: &[u8], data: &[u8]) -> [u8; 32] {
    const BLOCK: usize = 64;
    let mut padded = [0u8; BLOCK];
    if key.len() > BLOCK {
        let mut hasher = Sha256::new();
        hasher.update(key);
        padded[..32].copy_from_slice(&hasher.finalize());
    } else {
        padded[..key.len()].copy_from_slice(key);
    }
    let mut ipad = [0x36u8; BLOCK];
    let mut opad = [0x5cu8; BLOCK];
    for (index, byte) in padded.iter().enumerate() {
        ipad[index] ^= byte;
        opad[index] ^= byte;
    }
    let mut inner = Sha256::new();
    inner.update(ipad);
    inner.update(data);
    let mut outer = Sha256::new();
    outer.update(opad);
    outer.update(inner.finalize());
    outer.finalize().into()
}

/// HMAC-SHA256 → 标准 base64（钉钉机器人 sign =
/// Base64(HmacSHA256(timestamp + "\n" + appSecret, key=appSecret))）。
pub(crate) fn hmac_sha256_base64(key: &str, data: &str) -> String {
    BASE64.encode(hmac_sha256(key.as_bytes(), data.as_bytes()))
}

/// HMAC-SHA256 → 64 位小写 hex（淘宝全球栈 Authorization =
/// HEX_ENCODE(HMAC-SHA256(AppKey + message_body, AppSecret))，事实库 §4.2；
/// 官方 Java 示例逐字节 %02x 拼接后 toLowerCase，即小写 hex）。
pub(crate) fn hmac_sha256_hex(key: &str, data: &str) -> String {
    hex::encode(hmac_sha256(key.as_bytes(), data.as_bytes()))
}

/// 表单值百分号解码（RFC 3986 字节还原 + form 惯例「+」还原空格）：与前端
/// form.ts 单点同一语义（大写 hex 编码、UTF-8 字节序）。#45 自美团渠道提炼
/// 为跨渠道原语（美团/饿了么表单线共用）。
pub(crate) fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'%'
                if index + 2 < bytes.len()
                    && bytes[index + 1].is_ascii_hexdigit()
                    && bytes[index + 2].is_ascii_hexdigit() =>
            {
                let hex = std::str::from_utf8(&bytes[index + 1..index + 3])
                    .unwrap_or("");
                out.push(u8::from_str_radix(hex, 16).unwrap_or(b'%'));
                index += 3;
            }
            b'+' => {
                out.push(b' ');
                index += 1;
            }
            byte => {
                out.push(byte);
                index += 1;
            }
        }
    }
    String::from_utf8(out)
        .unwrap_or_else(|err| String::from_utf8_lossy(err.as_bytes()).into_owned())
}

/// 表单值百分号编码（RFC 3986 非保留字集原样，其余按 UTF-8 字节输出大写
/// %XX）：美团直发追加系统级参数与饿了么 H5 表单线共用。
pub(crate) fn form_encode_value(text: &str) -> String {
    let mut out = String::new();
    for byte in text.as_bytes() {
        match *byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char);
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

/// 明文表单 → 解码 kv 对（文档序）：无值参数落空串（美团「没有值的参数也需
/// 拼接」§4.1）；空段（连续 &）跳过。
pub(crate) fn form_pairs(body: &str) -> Vec<(String, String)> {
    body.split('&')
        .filter(|pair| !pair.is_empty())
        .map(|pair| match pair.split_once('=') {
            Some((key, value)) => (percent_decode(key), percent_decode(value)),
            None => (percent_decode(pair), String::new()),
        })
        .collect()
}

/// 去掉明文里携带的指定字段段（其余段原字节保留）：从真实推送拷贝的表单常带
/// 旧签名字段，重签语义要求签名由本连接密钥现算（美团/饿了么「sig 除外」、
/// 支付宝「sign 除外」口径，#46 自 sig 字面值泛化出参数化形态）。
pub(crate) fn strip_form_pair(body: &str, name: &str) -> String {
    body.split('&')
        .filter(|pair| {
            let key = pair.split('=').next().unwrap_or(pair);
            percent_decode(key) != name
        })
        .collect::<Vec<_>>()
        .join("&")
}

/// 去掉明文里携带的 sig 段（其余段原字节保留）：美团/饿了么表单线的旧 sig
/// 剔除（官方「sig 除外」口径）。
pub(crate) fn strip_sig(body: &str) -> String {
    strip_form_pair(body, "sig")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha1_hex_matches_known_vector() {
        // 独立来源：FIPS 180-1 测试向量 sha1("abc")
        assert_eq!(
            sha1_hex(&["abc"]),
            "a9993e364706816aba3e25717850c26c9cd0d89d"
        );
        // 多段按序拼接等价于单段拼接
        assert_eq!(sha1_hex(&["a", "bc"]), sha1_hex(&["abc"]));
    }

    #[test]
    fn sha1_sorted_hex_sorts_before_hashing() {
        // 排序后拼接 = 有序多段直接拼接
        assert_eq!(
            sha1_sorted_hex(&["c", "a", "b"]),
            sha1_hex(&["a", "b", "c"])
        );
        assert_eq!(sha1_sorted_hex(&["bc", "a"]), sha1_hex(&["a", "bc"]));
    }

    #[test]
    fn md5_base64_matches_known_vector() {
        // 独立来源：RFC 1321 测试向量 md5("abc") = 900150983cd24fb0d6963f7d28e17f72
        // 其 16 字节摘要的 base64 形态（Node crypto 交叉复算）
        assert_eq!(md5_base64("abc"), "kAFQmDzST7DWlj99KOF/cg==");
    }

    #[test]
    fn md5_hex_matches_known_vector() {
        // 独立来源：RFC 1321 测试向量 md5("abc")
        assert_eq!(
            md5_hex(&["abc"]),
            "900150983cd24fb0d6963f7d28e17f72"
        );
        // 多段按序拼接等价于单段拼接
        assert_eq!(md5_hex(&["a", "bc"]), md5_hex(&["abc"]));
        // 空串向量（RFC 1321）
        assert_eq!(md5_hex(&[""]), "d41d8cd98f00b204e9800998ecf8427e");
    }

    #[test]
    fn sha256_hex_matches_known_vector() {
        // 独立来源：FIPS 180-4 测试向量 sha256("abc")
        assert_eq!(
            sha256_hex(&[b"abc"]),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        // 多段按序拼接等价于单段拼接
        assert_eq!(sha256_hex(&[b"a", b"bc"]), sha256_hex(&[b"abc"]));
    }

    #[test]
    fn hmac_sha256_matches_rfc_4231_vectors() {
        // 独立来源：RFC 4231 测试向量 TC1/TC2（hex 参考值 + base64 形态）
        let tc2 = hmac_sha256(b"Jefe", b"what do ya want for nothing?");
        assert_eq!(
            hex::encode(tc2),
            "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
        );
        assert_eq!(
            BASE64.encode(tc2),
            "W9zBRr9gdU5qBCQmCJV1x1oAPwidJzmDnexYuWTsOEM="
        );
        // TC1：key = 0x0b × 20，data = "Hi There"
        let tc1 = hmac_sha256(&[0x0b; 20], b"Hi There");
        assert_eq!(
            hex::encode(tc1),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
    }

    #[test]
    fn hmac_sha256_handles_long_keys() {
        // key 超过 64 字节块长：先散列再填充（RFC 2104；Node crypto 交叉复算）
        let long_key = "k".repeat(100);
        let digest = hmac_sha256_base64(&long_key, "data");
        assert_eq!(digest, "CTgO5LgC2iNjvJbo4NEzuidUWOqN28Vk+Yb8ErMfjLE=");
    }

    #[test]
    fn hmac_sha256_hex_matches_known_vector() {
        // 独立来源：HMAC-SHA256 通行示例向量 key="key"、
        // data="The quick brown fox jumps over the lazy dog"（Node crypto 交叉复算）
        assert_eq!(
            hmac_sha256_hex(
                "key",
                "The quick brown fox jumps over the lazy dog"
            ),
            "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8"
        );
        // 多段拼接由调用方完成：同串同钥与 base64 变体摘要一致（编码仅形态不同）
        assert_eq!(
            hmac_sha256_hex("Jefe", "what do ya want for nothing?"),
            hex::encode(hmac_sha256(b"Jefe", b"what do ya want for nothing?"))
        );
    }

    #[test]
    fn percent_decode_restores_utf8_bytes_and_plus_as_space() {
        // 大写 hex %XX 还原 UTF-8 字节（与前端 form.ts 同一语义）
        assert_eq!(percent_decode("%E8%8D%AF%E5%93%81"), "药品");
        // form 惯例「+」还原空格；非编码文本原样
        assert_eq!(percent_decode("a+b%2Bc"), "a b+c");
        assert_eq!(percent_decode("668921"), "668921");
    }

    #[test]
    fn form_encode_value_matches_rfc3986_uppercase() {
        // 非保留字集原样，其余大写 %XX
        assert_eq!(form_encode_value("a b+c=d.e~f-g_h"), "a%20b%2Bc%3Dd.e~f-g_h");
        assert_eq!(form_encode_value("药品"), "%E8%8D%AF%E5%93%81");
        assert_eq!(form_encode_value(""), "");
    }

    #[test]
    fn form_pairs_decodes_document_order_and_keeps_empty_values() {
        // 文档序解码 kv；无值参数落空串；空段（连续 &）跳过
        let pairs = form_pairs("a=1&b=%E8%8D%AF%E5%93%81&c");
        assert_eq!(
            pairs,
            vec![
                ("a".to_string(), "1".to_string()),
                ("b".to_string(), "药品".to_string()),
                ("c".to_string(), String::new()),
            ]
        );
        assert_eq!(form_pairs("a=1&&b=2").len(), 2);
    }

    #[test]
    fn strip_sig_removes_only_sig_pair_verbatim() {
        // 旧 sig 剔除、其余段原字节保留（重签语义：sig 除外）
        assert_eq!(strip_sig("a=1&sig=abcdef&b=2"), "a=1&b=2");
        assert_eq!(strip_sig("sig=abcdef"), "");
        assert_eq!(strip_sig("signature=x&a=1"), "signature=x&a=1");
    }
}
