//! 官方黄金算例验签与随机要素形态（事实库 weibo.md §3.1/§4.1，无需网络）：
//! 三参排序验签对拍官方 sha1 结果、排序序与官方拼接串逐字一致、坏签拒绝、
//! 随机 nonce/echostr 与官方样本同形态。

use super::*;

#[test]
fn golden_signature_recomputes_official_vector() {
    // 官方算例：sha1(排序(xyz123xyz, 1397022061823, 57155157) 后拼接)
    assert_eq!(GOLDEN_SIGNATURE.len(), 40);
    let signature = build_callback_signature(GOLDEN_APP_SECRET, GOLDEN_TIMESTAMP, GOLDEN_NONCE);
    assert_eq!(signature, GOLDEN_SIGNATURE);
    // 排序序与官方拼接串逐字一致：timestamp < nonce < appsecret（数字 < 字母）。
    // 排序在测试侧独立复现，不复用被测实现（避免同函数自证）
    let mut sorted = [GOLDEN_APP_SECRET, GOLDEN_TIMESTAMP, GOLDEN_NONCE];
    sorted.sort_unstable();
    let concatenated: String = sorted.concat();
    assert_eq!(concatenated, GOLDEN_CONCATENATED);
    assert_eq!(
        crate::connections::util::sha1_hex(&[GOLDEN_CONCATENATED]),
        GOLDEN_SIGNATURE,
        "官方拼接串直接 sha1 即官方结果"
    );
    // 官方验证请求样例（事实库 §3.1 逐字）：同三元组配 echostr=dnPdpTZz85，
    // 返回该值即绑定成功——常量锚定官方原文，防手滑改动
    assert_eq!(GOLDEN_ECHOSTR, "dnPdpTZz85");
}

#[test]
fn signature_changes_with_any_param_and_rejects_forgery() {
    let base = build_callback_signature(GOLDEN_APP_SECRET, GOLDEN_TIMESTAMP, GOLDEN_NONCE);
    // 任一参数变化签名即变化（timestamp/nonce 换新值、密钥换新值）
    assert_ne!(build_callback_signature(GOLDEN_APP_SECRET, "1397022061824", GOLDEN_NONCE), base);
    assert_ne!(build_callback_signature(GOLDEN_APP_SECRET, GOLDEN_TIMESTAMP, "57155158"), base);
    assert_ne!(build_callback_signature("xyz123xyZ", GOLDEN_TIMESTAMP, GOLDEN_NONCE), base);
    // 参数次序无关：换序重排仍同一签名（字典序排序的语义）
    assert_eq!(build_callback_signature(GOLDEN_NONCE, GOLDEN_APP_SECRET, GOLDEN_TIMESTAMP), base);
}

#[test]
fn random_handshake_elements_match_official_sample_shape() {
    // nonce：官方算例 57155157 为 8 位数字
    let nonce = random_nonce();
    assert_eq!(nonce.len(), 8);
    assert!(nonce.chars().all(|c| c.is_ascii_digit()));
    // echostr：官方样例 dnPdpTZz85 为 10 位大小写字母数字混合
    let echostr = random_echostr();
    assert_eq!(echostr.len(), 10);
    assert!(echostr.chars().all(|c| c.is_ascii_alphanumeric()));
    // timestamp：官方算例 1397022061823 为 13 位毫秒
    let timestamp = unix_timestamp_millis().to_string();
    assert_eq!(timestamp.len(), 13, "timestamp 为毫秒形态：{timestamp}");
    // 随机性抽查：两次生成不同
    assert_ne!(nonce, random_nonce());
    assert_ne!(echostr, random_echostr());
}
