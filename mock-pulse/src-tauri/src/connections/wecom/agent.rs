//! 企微自建应用 XML 通道（事实库 §2.1/§2.2/§3.3，官方 90239/90240）：
//! 明文 XML 逐字节加密进 `{"encrypt": ...}` 信封（receiveid = corpId），
//! text/xml POST（msg_signature/timestamp/nonce 查询参数）；回执按企微
//! 三态处理（空串 / success / §3.5 加密被动回复包解密入记录）。
//! 握手与直发共用 super::crypto 原语与 super::echo_handshake。

use super::super::{send_measured_outcome, DispatchOutcome, DispatchSnapshot};
use super::{build_signature, decrypt_msg, encrypt_msg, extract_reply_encrypt, random_16};
use crate::connections::util::now_secs;

/// POST 业务推送信封（官方 §5.1 示例元素序：ToUserName → Encrypt → AgentID）。
/// 明文 XML 字节透传进 Encrypt，不重排。
fn build_envelope_xml(corp_id: &str, msg_encrypt: &str, agent_id: &str) -> String {
    format!(
        "<xml><ToUserName><![CDATA[{corp_id}]]></ToUserName>\
         <Encrypt><![CDATA[{msg_encrypt}]]></Encrypt>\
         <AgentID><![CDATA[{agent_id}]]></AgentID></xml>"
    )
}

/// 企微自建应用直发一条事件：明文 XML → 加密信封（receiveid=corpId）→
/// 四值字典序签名 → text/xml POST（msg_signature/timestamp/nonce 查询参数）。
/// 回执按企微语义处理：空串 / success 原样返回；
/// 若回执是加密被动回复包则解密出明文一并返回（入运行记录）。
///
/// 未发出请求即失败（配置不匹配/加密失败）走 [`DispatchOutcome::not_sent`]：
/// 协议要素不落值，零回执 + 失败原因。
/// 私有协议原语：对外只经 [`super::Adapter`]（super::super::ChannelAdapter）路由。
pub(super) fn dispatch_event(
    client: &reqwest::blocking::Client,
    url: &str,
    corp_id: &str,
    token: &str,
    encoding_aes_key: &str,
    agent_id: &str,
    plaintext: &str,
) -> DispatchOutcome {
    let msg_encrypt = match encrypt_msg(
        encoding_aes_key,
        &random_16(),
        plaintext.as_bytes(),
        corp_id,
    ) {
        Ok(value) => value,
        Err(reason) => return DispatchOutcome::not_sent(reason),
    };
    let timestamp = now_secs().to_string();
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let signature = build_signature(token, &timestamp, &nonce, &msg_encrypt);
    let envelope = build_envelope_xml(corp_id, &msg_encrypt, agent_id);
    let request = client
        .post(url)
        .query(&[
            ("msg_signature", signature.as_str()),
            ("timestamp", timestamp.as_str()),
            ("nonce", nonce.as_str()),
        ])
        .header("Content-Type", "text/xml")
        .body(envelope.clone());
    send_measured_outcome(
        request,
        "",
        DispatchSnapshot {
            // 企微的发送唯一标识即 nonce（RunStep.msg_id 快照）
            msg_id: nonce,
            signature,
            timestamp: Some(timestamp),
            request_body: Some(envelope),
        },
        |_, body| {
            extract_reply_encrypt(body).and_then(|encrypt| {
                decrypt_msg(encoding_aes_key, encrypt)
                    .ok()
                    .map(|decrypted| String::from_utf8_lossy(&decrypted.msg).to_string())
            })
        },
    )
}
