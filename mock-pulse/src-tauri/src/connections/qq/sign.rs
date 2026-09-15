//! QQ Webhook 的 Ed25519 验签原语（事实库 docs/research/channels/qq.md §3.2/§4，
//! 官方 Go 代码同构）：无 AES 加密体，签名体系只有 Ed25519。
//!
//! - 密钥派生（§4.2/§5.2 Go 逐字）：`seed := botSecret; for len(seed) <
//!   SeedSize { seed = strings.Repeat(seed, 2) }; seed = seed[:32]`——
//!   AppSecret 不够 32 字节就自我翻倍再截断，前 32 字节即 Ed25519 seed
//! - 事件验签（§4.2）：hex 解码 `X-Signature-Ed25519`（64 字节，末字节低 3 位
//!   须为 0），`msg = timestamp + 原始 body 字节`，Ed25519 verify
//! - op13 回签（§3.2/§5.2）：`signature = hex(Ed25519.Sign(priv, event_ts +
//!   plain_token))`，供模拟平台时自签与验目标回包
//!
//! 椭圆曲线运算不在本 crate 自实现（与 sha/hmac 的薄封装不同，签名体系
//! 取标准库 ed25519-dalek，RFC 8032）；官方向量回归见 tests/golden。

use ed25519_dalek::{Signature, Signer, SigningKey, Verifier};

/// Ed25519 签名长度（官方 Go：`ed25519.SignatureSize`）。
const SIGNATURE_SIZE: usize = 64;

/// 由 Bot Secret/AppSecret 派生 Ed25519 签名密钥（官方 webhook 页 Go 代码同构：
/// secret 自我翻倍至 ≥32 字节后截断，前 32 字节即 seed）。
fn signing_key(secret: &str) -> SigningKey {
    let mut seed = String::from(secret);
    while seed.len() < 32 {
        seed.push_str(secret);
    }
    let bytes: [u8; 32] = seed.as_bytes()[..32]
        .try_into()
        .expect("截断后恰为 32 字节");
    SigningKey::from_bytes(&bytes)
}

/// op13 回签（事实库 §3.2/§5.2）：`hex(Ed25519.Sign(priv, event_ts + plain_token))`。
/// 生产链路中 op13 由开发者服务回签、本工具只验；此签名原语供官方向量对拍
/// 与测试侧目标服务实现使用。
#[cfg(test)]
pub(crate) fn sign_validation(secret: &str, event_ts: &str, plain_token: &str) -> String {
    sign_hex(secret, &format!("{event_ts}{plain_token}").as_bytes())
}

/// 事件推送签名（事实库 §4.2/附速查，平台侧同式）：
/// `hex(Ed25519.Sign(priv, timestamp + 原始 body 字节))`。
pub(crate) fn sign_event(secret: &str, timestamp: &str, body: &[u8]) -> String {
    let mut msg = Vec::with_capacity(timestamp.len() + body.len());
    msg.extend_from_slice(timestamp.as_bytes());
    msg.extend_from_slice(body);
    sign_hex(secret, &msg)
}

fn sign_hex(secret: &str, msg: &[u8]) -> String {
    hex::encode(signing_key(secret).sign(msg).to_bytes())
}

/// 事件推送验签（事实库 §4.2，官方 Go 同序）：hex 解码签名 → 长度与末字节
/// 低 3 位检查 → `msg = timestamp + 原始 body 字节` → Ed25519 verify。
/// 生产链路中事件由本工具签名、目标侧验签；此验签方向仅测试链路回环使用。
#[cfg(test)]
pub(crate) fn verify_event(
    secret: &str,
    timestamp: &str,
    body: &[u8],
    signature_hex: &str,
) -> Result<(), String> {
    let signature = decode_signature(signature_hex)?;
    let mut msg = Vec::with_capacity(timestamp.len() + body.len());
    msg.extend_from_slice(timestamp.as_bytes());
    msg.extend_from_slice(body);
    verify(&signing_key(secret).verifying_key(), &msg, &signature)
}

/// op13 验证回调的签名校验（事实库 §3.2/§4.3 同一派生）：
/// `msg = event_ts + plain_token`，签名 hex 解码与末字节检查同事件验签。
pub(crate) fn verify_validation(
    secret: &str,
    event_ts: &str,
    plain_token: &str,
    signature_hex: &str,
) -> Result<(), String> {
    let signature = decode_signature(signature_hex)?;
    let msg = format!("{event_ts}{plain_token}");
    verify(&signing_key(secret).verifying_key(), msg.as_bytes(), &signature)
}

/// 签名 hex 解码 + 官方两道形态检查（§4.2 Go 逐字）：长度须为
/// `ed25519.SignatureSize` 且 `sig[63]&224 == 0`。
fn decode_signature(signature_hex: &str) -> Result<Signature, String> {
    let raw = hex::decode(signature_hex)
        .map_err(|_| format!("签名不是合法 hex：{signature_hex}"))?;
    if raw.len() != SIGNATURE_SIZE {
        return Err(format!(
            "签名长度须为 {SIGNATURE_SIZE} 字节，实际 {} 字节",
            raw.len()
        ));
    }
    if raw[63] & 224 != 0 {
        return Err("签名末字节低 3 位不为 0（官方 sig[63]&224 检查未通过）".to_string());
    }
    Signature::from_slice(&raw).map_err(|err| format!("签名解析失败：{err}"))
}

/// Ed25519 verify（RFC 8032；失败给人类可读原因）。
fn verify(
    verifying_key: &ed25519_dalek::VerifyingKey,
    msg: &[u8],
    signature: &Signature,
) -> Result<(), String> {
    verifying_key
        .verify(msg, signature)
        .map_err(|_| "Ed25519 验签未通过：签名与密钥/报文不匹配".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seed_derivation_matches_official_public_key_bytes() {
        // 官方向量 A（事实库 §4.2 逐字）：secret → seed 前 32 字节
        // "naOC0ocQE3shWLAfffVLB1rhYPG7naOC"；官方公钥给出首尾字节
        // [215 195 98 254 120 … 103 58]，中段官方以 … 省略
        let secret = "naOC0ocQE3shWLAfffVLB1rhYPG7";
        let key = signing_key(secret);
        let seed = key.to_bytes();
        assert_eq!(
            seed,
            *b"naOC0ocQE3shWLAfffVLB1rhYPG7naOC",
            "seed = secret 自我翻倍后截断 32 字节"
        );
        let verifying_key = key.verifying_key();
        let public = verifying_key.as_bytes();
        assert_eq!(public.len(), 32);
        assert_eq!(&public[..5], &[215, 195, 98, 254, 120], "官方公钥首 5 字节");
        assert_eq!(&public[28..], &[93, 118, 103, 58], "官方公钥末 4 字节");
    }

    #[test]
    fn op13_signature_matches_official_vector() {
        // 官方向量（事实库 §3.2/§5.2 逐字）：secret "DG5g3B4j9X2KOErG"、
        // msg = event_ts + plain_token，签名 128 位 hex 逐字
        let signature = sign_validation("DG5g3B4j9X2KOErG", "1725442341", "Arq0D5A61EgUu4OxUvOp");
        assert_eq!(
            signature,
            "87befc99c42c651b3aac0278e71ada338433ae26fcb24307bdc5ad38c1adc2d01bcfcadc0842edac85e85205028a1132afe09280305f13aa6909ffc2d652c706"
        );
    }

    #[test]
    fn verify_accepts_official_op13_signature_and_rejects_tampering() {
        // 验签链路：官方向量签名 verify 通过；报文/签名任一被改即拒
        let secret = "DG5g3B4j9X2KOErG";
        let signature = "87befc99c42c651b3aac0278e71ada338433ae26fcb24307bdc5ad38c1adc2d01bcfcadc0842edac85e85205028a1132afe09280305f13aa6909ffc2d652c706";
        assert!(verify_validation(secret, "1725442341", "Arq0D5A61EgUu4OxUvOp", signature).is_ok());
        assert!(verify_validation(secret, "1725442342", "Arq0D5A61EgUu4OxUvOp", signature).is_err());
        assert!(verify_validation(secret, "1725442341", "Arq0D5A61EgUu4OxUvOQ", signature).is_err());
        // 事件验签同链路：对自签报文可验回
        let event_signature = sign_validation(secret, "1725442341", "Arq0D5A61EgUu4OxUvOp");
        assert!(verify_event(secret, "1725442341", b"Arq0D5A61EgUu4OxUvOp", &event_signature).is_ok());
    }

    #[test]
    fn verify_rejects_bad_signature_shapes() {
        let secret = "DG5g3B4j9X2KOErG";
        // 非 hex / 长度不足 / 末字节低 3 位非 0（官方 sig[63]&224 形态检查）
        assert!(verify_event(secret, "1725442341", b"{}", "zz").is_err());
        let short = "87befc99";
        assert!(verify_event(secret, "1725442341", b"{}", short).is_err());
        // 高 3 位全置 1：末字节形态非法
        let raw = "87befc99c42c651b3aac0278e71ada338433ae26fcb24307bdc5ad38c1adc2d01bcfcadc0842edac85e85205028a1132afe09280305f13aa6909ffc2d652c706";
        let mut malformed = raw.to_string();
        malformed.replace_range(126..127, "f");
        assert!(verify_event(secret, "1725442341", b"{}", &malformed).is_err());
    }
}
