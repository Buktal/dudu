//! RSA2 签名黄金对拍与待签串语义（事实库 alipay.md §4.1/§4.3/§5.1/§5.2，
//! 无需网络）：签名 → 验签自反对拍、待签串 rsaCheckV1 四步（剔除
//! sign/sign_type → url_decode → 字典序 → k=v & 连接）、篡改必败、空串边界、
//! 私钥三形态解析、信封快照（notify_id/trade_no 幂等键 + notify_time）、
//! sign_type 补齐、旧 sign 剔除。官方无可用通知验签向量（§5.1 样例 sign 为
//! 截断示意值），不作示意值对拍（tests/mod.rs 文档）。

use rsa::pkcs8::{DecodePublicKey, EncodePublicKey, LineEnding};
use rsa::traits::PublicKeyParts;
use rsa::RsaPublicKey;

use super::*;

/// 共用测试私钥 + 成对公钥（验签侧对偶）。
fn keypair() -> (RsaPrivateKey, RsaPublicKey) {
    let private_key = parse_private_key(&test_private_key_pem()).expect("测试私钥应可解析");
    let public_key = private_key.to_public_key().clone();
    (private_key, public_key)
}

#[test]
fn sign_and_verify_roundtrip_on_rsa_check_v1_concat() {
    // 黄金对拍：官方 §5.1 样本参数（解码形态）按 rsaCheckV1 拼串 → RSA2 签名
    // → base64 → 公钥验签必过（签名 → 验签闭环）
    let pairs: Vec<(String, String)> = [
        ("notify_time", GOLDEN_NOTIFY_TIME),
        ("notify_type", "trade_status_sync"),
        ("notify_id", GOLDEN_NOTIFY_ID),
        ("charset", "utf-8"),
        ("version", "1.0"),
        ("sign_type", "RSA2"),
        ("auth_app_id", "2018072300007418"),
        ("trade_no", GOLDEN_TRADE_NO),
        ("app_id", "2019082200007148"),
        ("out_trade_no", "6823789339978248"),
        ("trade_status", "TRADE_SUCCESS"),
    ]
    .iter()
    .map(|(key, value)| (key.to_string(), value.to_string()))
    .collect();
    let (private_key, public_key) = keypair();
    let concat = signing_concat(&pairs);
    // 待签串不含 sign/sign_type（§4.3「除去 sign、sign_type」逐字），其余
    // 字母序 k=v & 连接
    assert!(concat.starts_with("app_id=2019082200007148&auth_app_id="));
    assert!(concat.contains("notify_id=ac05099524730693a8b330c45cf72da943"));
    assert!(!concat.contains("sign_type"));
    assert!(concat.ends_with("version=1.0"));

    let signature = ali_sign(&concat, &private_key);
    // RSA2 = SHA256WithRSA 2048 位：base64 解码后 256 字节
    assert_eq!(signature.len(), 344, "2048 位签名的标准 base64 长度");
    assert!(ali_verify(&concat, &public_key, &signature));
}

#[test]
fn sign_concat_sorts_bytewise_and_decodes_wire_values() {
    // 字节序语义：大写字母（Z=0x5A）排在小写字母（a=0x61）之前——官方口径
    // 「按照第一个字符的键值 ASCII 码递增排序」（§4.1 步骤 2 逐字）
    let pairs: Vec<(String, String)> = [
        ("Zebra", "1"),
        ("apple", "2"),
        ("app_id", "3"),
        ("charset", "a b"),
    ]
    .iter()
    .map(|(key, value)| (key.to_string(), value.to_string()))
    .collect();
    let concat = signing_concat(&pairs);
    assert_eq!(
        concat, "Zebra=1&app_id=3&apple=2&charset=a b",
        "ASCII 递增（大写在前）、url_decode 后原文值参签"
    );
    // 输入参数序不敏感：乱序输入同结果
    let mut scrambled = pairs.clone();
    scrambled.reverse();
    assert_eq!(signing_concat(&scrambled), concat);
    // 值取解码后的原文（§4.3 步骤 2「先 url_decode 再排序拼串」）：线上
    // %20 形态解码后参签
    let wire = form_pairs("total_amount=10.99&subject=%E8%8D%AF%E5%93%81");
    let concat = signing_concat(&wire);
    assert!(concat.contains("subject=药品"));
    assert!(concat.contains("total_amount=10.99"));
}

#[test]
fn verify_fails_on_tampered_concat_or_signature() {
    // 篡改必败：任一字节变化（参数值/密钥对/签名截断）验签必不过
    let pairs: Vec<(String, String)> = [
        ("app_id", "2019082200007148"),
        ("trade_status", "TRADE_SUCCESS"),
        ("total_amount", "10.99"),
    ]
    .iter()
    .map(|(key, value)| (key.to_string(), value.to_string()))
    .collect();
    let (private_key, public_key) = keypair();
    let signature = ali_sign(&signing_concat(&pairs), &private_key);

    assert!(ali_verify(&signing_concat(&pairs), &public_key, &signature));
    // 金额篡改（§3.4「判断 total_amount 是否确实为该订单的实际金额」的
    // 验签防线）：验签必败
    let tampered: Vec<(String, String)> = pairs
        .iter()
        .map(|(key, value)| {
            if key == "total_amount" {
                (key.clone(), "99.10".to_string())
            } else {
                (key.clone(), value.clone())
            }
        })
        .collect();
    assert!(!ali_verify(
        &signing_concat(&tampered),
        &public_key,
        &signature
    ));
    // 签名截断/非 base64：验签必败
    assert!(!ali_verify(
        &signing_concat(&pairs),
        &public_key,
        &signature[..128]
    ));
    assert!(!ali_verify(
        &signing_concat(&pairs),
        &public_key,
        "not-base64!!"
    ));
}

#[test]
fn sign_handles_empty_concat_boundary() {
    // 空串边界（待签串为空）：签名可计算、验签成立、篡改必败
    let (private_key, public_key) = keypair();
    let signature = ali_sign("", &private_key);
    assert_eq!(signature.len(), 344);
    assert!(ali_verify("", &public_key, &signature));
    assert!(!ali_verify("x", &public_key, &signature));
}

#[test]
fn private_key_parses_pkcs8_pkcs1_pem_and_base64_der() {
    // 凭据字段按「PEM 或 Base64」口径收三种文本形态：同一密钥三形态互转
    // 解析后指纹一致（n 相同），坏文本给出可读错误
    use rsa::pkcs1::EncodeRsaPrivateKey;
    use rsa::pkcs1::LineEnding as Pkcs1LineEnding;
    let private_key = parse_private_key(&test_private_key_pem()).expect("PKCS#8 PEM");

    let pkcs1_pem = private_key
        .to_pkcs1_pem(Pkcs1LineEnding::LF)
        .expect("导出 PKCS#1 PEM");
    let parsed_pkcs1 = parse_private_key(&pkcs1_pem).expect("PKCS#1 PEM");
    assert_eq!(
        private_key.n().to_bytes_be(),
        parsed_pkcs1.n().to_bytes_be()
    );

    use base64::engine::general_purpose::STANDARD as BASE64;
    use base64::Engine;
    let pkcs1_der = private_key.to_pkcs1_der().expect("PKCS#1 DER");
    let der_b64 = BASE64.encode(pkcs1_der.as_bytes());
    // 中段换行/空白容忍（真实私钥文件常折行）
    let folded = format!("{}\r\n  {}", &der_b64[..64], &der_b64[64..]);
    let parsed_der = parse_private_key(&folded).expect("DER Base64（容忍空白）");
    assert_eq!(private_key.n().to_bytes_be(), parsed_der.n().to_bytes_be());

    assert!(parse_private_key("").is_err(), "空私钥拒绝");
    assert!(parse_private_key("not-a-key").is_err(), "非 Base64 拒绝");
    // 存量应用 1024 位密钥口径（事实库 §4.1「已使用 RSA 密钥长度即 1024 位
    // 密钥长度的应用仍然可以正常调用接口」）：DER Base64 同样可解析
    let legacy = RsaPrivateKey::new(&mut rand::rngs::OsRng, 1024).expect("1024 位临时密钥");
    let legacy_der = legacy.to_pkcs1_der().expect("DER");
    assert!(parse_private_key(&BASE64.encode(legacy_der.as_bytes())).is_ok());
}

#[test]
fn public_key_pem_roundtrip_through_receiver_side() {
    // 商户侧以「支付宝公钥」验签（§4.3）：私钥导出的公钥按 PEM 分发后仍验签
    // 成立——对偶闭环即测试联调的密钥交接形态
    let (private_key, public_key) = keypair();
    let public_pem = public_key
        .to_public_key_pem(LineEnding::LF)
        .expect("导出公钥 PEM");
    let parsed_public = RsaPublicKey::from_public_key_pem(&public_pem).expect("解析公钥 PEM");
    let signature = ali_sign("notify_type=trade_status_sync", &private_key);
    assert!(ali_verify(
        "notify_type=trade_status_sync",
        &parsed_public,
        &signature
    ));
}

#[test]
fn message_id_snapshot_prefers_notify_id_then_trade_ids() {
    // 幂等键快照：notify_id 首选（重试不变 §3.4），缺失回退 trade_no /
    // out_trade_no；均缺失不落值
    let pairs = form_pairs(GOLDEN_NOTIFY_BODY);
    assert_eq!(message_id_of(&pairs), GOLDEN_NOTIFY_ID);
    let without_notify =
        form_pairs("trade_no=2013112011001004330000121536&out_trade_no=6823789339978248");
    assert_eq!(
        message_id_of(&without_notify),
        "2013112011001004330000121536",
        "trade_no 先于 out_trade_no"
    );
    let only_out = form_pairs("out_trade_no=6823789339978248");
    assert_eq!(message_id_of(&only_out), "6823789339978248");
    assert_eq!(message_id_of(&form_pairs("charset=utf-8")), "");
}

#[test]
fn notify_time_snapshot_follows_plaintext_envelope() {
    // notify_time 快照取明文信封值（§5.1 样本 2018-10-21 15:45:22），缺失
    // 不落值——信封字段属载荷本体，适配器不代生成
    let pairs = form_pairs(GOLDEN_NOTIFY_BODY);
    assert_eq!(notify_time_of(&pairs), GOLDEN_NOTIFY_TIME);
    assert_eq!(notify_time_of(&form_pairs("charset=utf-8")), "");
}

#[test]
fn ensure_sign_type_appends_rsa2_only_when_missing() {
    // sign_type 在线上传输但不出现在待签串：缺失补 RSA2（新建应用必须 §4.1），
    // 已带时原样保留（生活号等通知形态 sign_type 值随明文）
    assert_eq!(
        ensure_sign_type("app_id=1&charset=utf-8"),
        "app_id=1&charset=utf-8&sign_type=RSA2"
    );
    assert_eq!(
        ensure_sign_type("sign_type=RSA1&app_id=1"),
        "sign_type=RSA1&app_id=1"
    );
    assert_eq!(ensure_sign_type(""), "sign_type=RSA2");
}

#[test]
fn stale_sign_is_stripped_and_never_signs_sign_fields() {
    // 从真实推送拷贝的表单带旧 sign：剔除后现算（官方「除去 sign、sign_type」
    // 重签口径）；待签串恒不含 sign 字段
    let body = strip_form_pair(GOLDEN_NOTIFY_BODY, "sign");
    assert!(!body.contains("601510b7970e52cc63db0f44997cf70e"));
    let pairs = form_pairs(&body);
    assert!(pairs.iter().all(|(key, _)| key != "sign"));
    let concat = signing_concat(&pairs);
    assert!(!concat.contains("sign="));
    assert!(!concat.contains("sign_type"));
    // 其余业务字节逐段保留（ADR-0001）：notify_time 的 %20 编码原样
    assert!(body.contains("notify_time=2018-10-21%2015%3A45%3A22"));
    // util 泛化原语与旧 strip_sig 行为一致（sig 字段渠道不受影响）
    assert_eq!(
        crate::connections::util::strip_sig("a=1&sig=x&b=2"),
        "a=1&b=2"
    );
}
