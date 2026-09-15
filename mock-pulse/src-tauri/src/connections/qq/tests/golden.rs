//! 「op13 请求体 → 目标回包 → 验签」与「事件 → 签名三头」链路复算（无需网络）：
//! 官方向量凭据（secret DG5g3B4j9X2KOErG / plain_token Arq0D5A61EgUu4OxUvOp /
//! event_ts 1725442341）下 op13 签名逐字对拍官方 §5.2；事件签名 hex 与
//! Node crypto 交叉复算值对拍；随机 plain_token 官方样本形态。

use super::*;

#[test]
fn op13_request_body_follows_official_envelope_shape() {
    // 官方信封形态（§3.2 逐字键序）：d 在前（plain_token/event_ts），op 在后
    let body = build_validation_body(GOLDEN_PLAIN_TOKEN, GOLDEN_EVENT_TS);
    assert_eq!(
        body,
        r#"{"d":{"plain_token":"Arq0D5A61EgUu4OxUvOp","event_ts":"1725442341"},"op":13}"#
    );
    // 载荷识别只认 op=13 + 字符串型 plain_token/event_ts
    let payload = parse_validation_payload(&body).expect("op13 载荷应被识别");
    assert_eq!(payload.plain_token, GOLDEN_PLAIN_TOKEN);
    assert_eq!(payload.event_ts, GOLDEN_EVENT_TS);
    // 普通事件信封不误判为 op13
    assert!(parse_validation_payload(GOLDEN_EVENT_PLAINTEXT).is_none());
    assert!(parse_validation_payload("not json").is_none());
    assert!(parse_validation_payload(r#"{"d":{"plain_token":1,"event_ts":"1"},"op":13}"#).is_none());
}

#[test]
fn op13_official_vector_signs_and_verifies_through_reply_path() {
    // 官方 §5.2 逐字向量：secret + event_ts + plain_token → 官方签名 hex；
    // 回包校验入口对官方签名验签通过且回显 plain_token
    let reply_body = format!(
        r#"{{"plain_token":"{GOLDEN_PLAIN_TOKEN}","signature":"{GOLDEN_SIGNATURE}"}}"#
    );
    let echoed = verify_validation_reply(
        GOLDEN_APP_SECRET,
        GOLDEN_PLAIN_TOKEN,
        GOLDEN_EVENT_TS,
        &reply_body,
    )
    .unwrap();
    assert_eq!(echoed, GOLDEN_PLAIN_TOKEN);

    // 自签与官方签名逐字一致（同 secret 同 msg 必同签，Ed25519 确定性）
    let signed = sign::sign_validation(GOLDEN_APP_SECRET, GOLDEN_EVENT_TS, GOLDEN_PLAIN_TOKEN);
    assert_eq!(signed, GOLDEN_SIGNATURE);
}

#[test]
fn op13_reply_verification_rejects_broken_replies() {
    let ok_reply = format!(
        r#"{{"plain_token":"{GOLDEN_PLAIN_TOKEN}","signature":"{GOLDEN_SIGNATURE}"}}"#
    );
    // plain_token 未回显同值：拒绝
    let wrong_echo = ok_reply.replace(GOLDEN_PLAIN_TOKEN, "OtherToken1234567890");
    assert!(verify_validation_reply(
        GOLDEN_APP_SECRET,
        GOLDEN_PLAIN_TOKEN,
        GOLDEN_EVENT_TS,
        &wrong_echo
    )
    .is_err());
    // 签名被篡改：拒绝
    let tampered = ok_reply.replace("87befc99", "00000000");
    assert!(verify_validation_reply(
        GOLDEN_APP_SECRET,
        GOLDEN_PLAIN_TOKEN,
        GOLDEN_EVENT_TS,
        &tampered
    )
    .is_err());
    // event_ts 与请求不一致（签名对不上）：拒绝
    assert!(verify_validation_reply(
        GOLDEN_APP_SECRET,
        GOLDEN_PLAIN_TOKEN,
        "1725442342",
        &ok_reply
    )
    .is_err());
    // 缺 signature / 非 JSON：拒绝
    let missing = r#"{"plain_token":"Arq0D5A61EgUu4OxUvOp"}"#;
    assert!(verify_validation_reply(
        GOLDEN_APP_SECRET,
        GOLDEN_PLAIN_TOKEN,
        GOLDEN_EVENT_TS,
        missing
    )
    .is_err());
    assert!(verify_validation_reply(GOLDEN_APP_SECRET, GOLDEN_PLAIN_TOKEN, GOLDEN_EVENT_TS, "ok")
        .is_err());
}

#[test]
fn event_signature_matches_cross_implemented_vector() {
    // 事件签名（事实库 §4.2/附速查）：msg = timestamp + 原始 body 字节；
    // 期望值由 Node crypto（PKCS8 同 seed 派生）交叉复算收口，
    // Ed25519 原语另有官方 §3.2/§5.2 独立向量对拍（本文件上方 + sign 模块测试）
    let signature = sign::sign_event(
        GOLDEN_APP_SECRET,
        "1784570523",
        br#"{"id":"ROBOT1.0_test"}"#,
    );
    assert_eq!(
        signature,
        "3cf37dc85bbbc81cc469b34b8e72142f1543a4660325d53be23a50707e85c1382354b0f1c7a57a5db1dff93772cd9d5ceceea3944183d39918adad633031800d"
    );
    // 验签链路对自签事件回环通过
    assert!(sign::verify_event(
        GOLDEN_APP_SECRET,
        "1784570523",
        br#"{"id":"ROBOT1.0_test"}"#,
        &signature
    )
    .is_ok());
}

#[test]
fn random_plain_token_matches_official_sample_shape() {
    // 官方样本 Arq0D5A61EgUu4OxUvOp = 20 位字母数字；随机派生同形态
    let token = random_plain_token();
    assert_eq!(token.len(), 20);
    assert!(token.chars().all(|c| c.is_ascii_alphanumeric()));
    // 随机性抽查：uuid v4 字节派生，两次生成不同
    assert_ne!(token, random_plain_token());
}
