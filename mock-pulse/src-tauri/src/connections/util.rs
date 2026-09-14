//! 跨渠道签名/加密原语（util 层单点，各渠道 adapter 复用，不感知渠道语义）：
//! - [`sha1_hex`]：按给定顺序拼接后 sha1 → 40 位小写 hex（抖音 dop/生活服务
//!   X-Douyin-Signature）
//! - [`sha1_sorted_hex`]：字典序排序后拼接 sha1（微信系四值签名家族：
//!   企微 msg_signature、抖音服务商 MsgSignature）
//! - [`md5_base64`]：md5 摘要（16 字节）→ 标准 base64（抖音小游戏 x-signature）
//! - [`sha256_hex`]：按给定顺序拼接各段（字节串）后 sha256 → 64 位小写 hex
//!   （飞书 X-Lark-Signature：timestamp+nonce+encrypt_key+原始 body 字节）
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
    fn sha256_hex_matches_known_vector() {
        // 独立来源：FIPS 180-4 测试向量 sha256("abc")
        assert_eq!(
            sha256_hex(&[b"abc"]),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        // 多段按序拼接等价于单段拼接
        assert_eq!(sha256_hex(&[b"a", b"bc"]), sha256_hex(&[b"abc"]));
    }
}
