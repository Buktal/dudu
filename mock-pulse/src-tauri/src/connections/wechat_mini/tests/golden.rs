//! 官方数值例复算（无需网络）：四组黄金向量逐字锚定事实库
//! docs/research/channels/wechat-mini.md——GET 握手 f464b24（§3.2）、
//! 明文三参 899cf89e（§5.1 推送 URL）、安全模式密文解密 + 四参
//! 046e02f8（§4.2/§5.2）、加密回包重加密 + 签名 1b933996（§4.3/§5.6，
//! 含 Nonce 复用请求值语义）。

use super::*;

#[test]
fn golden_handshake_signature_recomputes_official_value() {
    // 数值例一：token/timestamp/nonce 字典序排序拼接后 sha1（GET 握手签名）
    assert_eq!(
        build_callback_signature(
            GOLDEN_TOKEN,
            GOLDEN_HANDSHAKE_TIMESTAMP,
            GOLDEN_HANDSHAKE_NONCE,
        ),
        GOLDEN_HANDSHAKE_SIGNATURE
    );
}

#[test]
fn golden_plain_post_signature_recomputes_official_value() {
    // 数值例二：明文模式推送 URL 的三参签名（事实库 §5.1）
    assert_eq!(
        build_callback_signature(GOLDEN_TOKEN, GOLDEN_PLAIN_TIMESTAMP, GOLDEN_PLAIN_NONCE),
        GOLDEN_PLAIN_SIGNATURE
    );
}

#[test]
fn golden_push_ciphertext_decrypts_to_official_demo_json() {
    // 数值例三：官方密文 → AES 解密 → 明文为 167 字节 demo JSON、尾部 AppId
    // 与自身相符（事实库 §4.3「appid 须校验与本小程序一致」）。
    let decrypted = decrypt_msg(GOLDEN_ENCODING_AES_KEY, GOLDEN_PUSH_ENCRYPT).unwrap();
    assert_eq!(decrypted.msg.len(), 167);
    assert_eq!(decrypted.msg, GOLDEN_PUSH_PLAINTEXT.as_bytes());
    assert_eq!(decrypted.receiveid, GOLDEN_APP_ID);

    // 同例四参 msg_signature：sha1(排序(token, timestamp, nonce, Encrypt))
    let signature = build_msg_signature(
        GOLDEN_TOKEN,
        GOLDEN_PUSH_TIMESTAMP,
        GOLDEN_PUSH_NONCE,
        GOLDEN_PUSH_ENCRYPT,
    );
    assert_eq!(signature, GOLDEN_PUSH_MSG_SIGNATURE);
}

#[test]
fn golden_reply_example_reencrypts_to_official_ciphertext_and_signature() {
    // 数值例四：官方 random/msg/appid 逐字节重加密 → 官方 Encrypt 密文
    // （覆盖 IV=key 前 16B、PKCS#7-32、Base64 全链路），回包签名同例复算；
    // 官方示例回包 Nonce 复用推送 nonce（事实库 §3.4），mock 快照语义同源。
    let encrypt = encrypt_msg(
        GOLDEN_ENCODING_AES_KEY,
        GOLDEN_REPLY_RANDOM,
        GOLDEN_REPLY_PLAINTEXT.as_bytes(),
        GOLDEN_APP_ID,
    )
    .unwrap();
    assert_eq!(encrypt, GOLDEN_REPLY_ENCRYPT);

    let signature = build_msg_signature(
        GOLDEN_TOKEN,
        GOLDEN_REPLY_TIMESTAMP,
        GOLDEN_REPLY_NONCE,
        &encrypt,
    );
    assert_eq!(signature, GOLDEN_REPLY_SIGNATURE);

    // Nonce 复用请求值：官方推送 nonce 与回包 Nonce 同为 415670741
    assert_eq!(GOLDEN_REPLY_NONCE, GOLDEN_PUSH_NONCE);
}
