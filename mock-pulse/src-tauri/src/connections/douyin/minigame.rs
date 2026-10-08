//! 小游戏消息推送协议（事实库 §3.4/§4.2）：
//! - 验签：x-signature = base64(md5(x-appid/x-msg-type/x-nonce-str/x-timestamp
//!   四头按字典序排序、`&` 拼接成 key=value 串后直接拼 body 与 token))
//! - 头集合：x-appid / x-msg-type / x-nonce-str / x-timestamp（毫秒）/ x-signature
//! - 握手：保存时 POST verify_request，官方「验签通过回 HTTP 200 即保存成功」
//! - x-msg-type 枚举：verify_request（验证请求）/ gift_delivery（游戏站礼包推送）/
//!   douyin_microgame_im（抖音客服消息推送）
//! - 旧「消息推送客服」GET echostr 体系 2025-06-30 已下线，不实现

use super::super::{
    no_reply, send_measured_outcome, DispatchOutcome, DispatchSnapshot, HandshakeOutcome,
};
use crate::connections::util;

/// 官方黄金例（§4.2 逐字）：四头字典序 `&` 拼接 + body + token
/// = base64(md5(拼接串))，拼接串 `x-appid=tt12321&x-msg-type=verify_request&
/// x-nonce-str=123456&x-timestamp=456789` + `verify_body` + `verify_token`
/// → `AoOtx/dFR5MFrCTqUmtmDg==`。
pub(super) fn signature(
    app_id: &str,
    msg_type: &str,
    nonce: &str,
    timestamp: &str,
    body: &str,
    token: &str,
) -> String {
    let mut headers = [
        format!("x-appid={app_id}"),
        format!("x-msg-type={msg_type}"),
        format!("x-nonce-str={nonce}"),
        format!("x-timestamp={timestamp}"),
    ];
    headers.sort_unstable();
    util::md5_base64(&format!("{}{body}{token}", headers.join("&")))
}

/// 直发时 x-msg-type 从报文形态派生（官方按推送类型标注，事实库 §3.4 枚举）：
/// - 报文含 gift_delivery（礼包推送占位形态）→ gift_delivery
/// - 报文含 MsgType（客服消息 JSON 信封 §5.19）→ douyin_microgame_im
/// - 其余（验证请求，官方未公开报文体）→ verify_request
fn msg_type_of(body: &str) -> &'static str {
    if body.contains("gift_delivery") {
        "gift_delivery"
    } else if body.contains("MsgType") {
        "douyin_microgame_im"
    } else {
        "verify_request"
    }
}

/// 小游戏推送直发公共体：body 逐字节透传，五头按官方算法生成
/// （x-nonce-str/x-timestamp 每次推送重生成）。期望回执按官方语义：
/// 验签通过目标回 HTTP 200 即成功，响应体不校验。
/// 私有协议原语：对外只经 [`super::Adapter`]（super::super::ChannelAdapter）路由。
fn post(
    client: &reqwest::blocking::Client,
    url: &str,
    body: &str,
    msg_type: &str,
    app_id: &str,
    token: &str,
) -> DispatchOutcome {
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let timestamp = util::now_millis().to_string();
    let signature = signature(app_id, msg_type, &nonce, &timestamp, body, token);
    let request = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("x-appid", app_id)
        .header("x-msg-type", msg_type)
        .header("x-nonce-str", &nonce)
        .header("x-timestamp", &timestamp)
        .header("x-signature", signature.clone())
        .body(body.to_string());
    send_measured_outcome(
        request,
        "",
        DispatchSnapshot {
            // 发送唯一标识快照 = x-nonce-str
            msg_id: nonce,
            signature,
            timestamp: Some(timestamp),
            request_body: Some(body.to_string()),
        },
        no_reply,
    )
}

/// 按官方形态向目标发起 verify_request 握手：POST 带 x-signature 五头，
/// 期望 HTTP 200（官方：验签通过回 HTTP 200 即保存成功，响应体不校验）。
/// 私有协议原语：对外只经 [`super::Adapter`]（super::super::ChannelAdapter）路由。
pub(super) fn verify_handshake(
    client: &reqwest::blocking::Client,
    url: &str,
    client_key: &str,
    mini_game_token: &str,
) -> HandshakeOutcome {
    // 官方未公开 verify_request 报文体（待核验），握手校验以头集合与验签为准
    let body = "{}";
    let outcome = post(
        client,
        url,
        body,
        "verify_request",
        client_key,
        mini_game_token,
    );
    match outcome.error {
        Some(error) => HandshakeOutcome {
            ok: false,
            message: error,
        },
        None if (200..300).contains(&outcome.status) => HandshakeOutcome {
            ok: true,
            message: format!(
                "verify_request 握手成功：x-signature 验签通过（HTTP {}，官方要求 200 即保存成功）",
                outcome.status
            ),
        },
        None => HandshakeOutcome {
            ok: false,
            message: format!("目标返回 HTTP {}，verify_request 握手未通过", outcome.status),
        },
    }
}

/// 直发一条小游戏推送：x-msg-type 按报文形态派生（见 [`msg_type_of`]）。
/// 私有协议原语：对外只经 [`super::Adapter`]（super::super::ChannelAdapter）路由。
pub(super) fn dispatch(
    client: &reqwest::blocking::Client,
    url: &str,
    body: &str,
    app_id: &str,
    token: &str,
) -> DispatchOutcome {
    let msg_type = msg_type_of(body);
    post(client, url, body, msg_type, app_id, token)
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::test_support::{quick_client, start_single_server, RecordedPost};

    #[test]
    fn signature_reproduces_official_golden_vector() {
        // 事实库 §4.2 官方拼接串黄金例（逐字）：
        // x-appid=tt12321&x-msg-type=verify_request&x-nonce-str=123456
        // &x-timestamp=456789 + verify_body + verify_token
        // → AoOtx/dFR5MFrCTqUmtmDg==
        assert_eq!(
            signature(
                "tt12321",
                "verify_request",
                "123456",
                "456789",
                "verify_body",
                "verify_token"
            ),
            "AoOtx/dFR5MFrCTqUmtmDg=="
        );
    }

    #[test]
    fn signature_depends_on_sorted_header_order_only() {
        // 参数顺序不影响结果（内部字典序排序），任一取值变化则签名变化
        let a = signature("A", "verify_request", "n1", "t1", "b", "tk");
        let b = signature("A", "verify_request", "n1", "t1", "b", "tk");
        let c = signature("A", "verify_request", "n2", "t1", "b", "tk");
        assert_eq!(a, b);
        assert_ne!(a, c);
    }

    #[test]
    fn msg_type_follows_payload_shape() {
        assert_eq!(msg_type_of("{}"), "verify_request");
        assert_eq!(
            msg_type_of(r#"{"ToUserName":"appid","MsgType":"text"}"#),
            "douyin_microgame_im"
        );
        assert_eq!(
            msg_type_of(r#"<xml><MsgType><![CDATA[text]]></MsgType></xml>"#),
            "douyin_microgame_im"
        );
        assert_eq!(
            msg_type_of(r#"{"ToUserName":"appid","MsgType":"gift_delivery"}"#),
            "gift_delivery"
        );
    }

    #[test]
    fn handshake_posts_verify_request_with_signature_headers() {
        let responder: fn(&RecordedPost) -> (String, String) =
            |_| ("HTTP/1.1 200 OK".into(), String::new());
        let (addr, rx) = start_single_server(responder, Duration::ZERO);
        let url = format!("http://{addr}/push");
        let outcome = verify_handshake(
            &quick_client(Duration::from_secs(2)),
            &url,
            "tt12321",
            "mg_token",
        );

        assert!(outcome.ok, "应成功：{outcome:?}");
        let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(request.request_line.starts_with("POST /push"));
        assert_eq!(request.body, "{}");
        // 官方五头逐项核对（§3.4）
        assert_eq!(request.header("x-appid").as_deref(), Some("tt12321"));
        assert_eq!(
            request.header("x-msg-type").as_deref(),
            Some("verify_request")
        );
        let nonce = request.header("x-nonce-str").expect("缺少 x-nonce-str");
        let timestamp = request.header("x-timestamp").expect("缺少 x-timestamp");
        assert_eq!(timestamp.len(), 13, "x-timestamp 为毫秒时间戳：{timestamp}");
        // x-signature 可按官方算法对实际发送内容复算
        assert_eq!(
            request.header("x-signature"),
            Some(signature(
                "tt12321",
                "verify_request",
                &nonce,
                &timestamp,
                &request.body,
                "mg_token"
            ))
        );
    }

    #[test]
    fn handshake_fails_on_non_200() {
        let responder: fn(&RecordedPost) -> (String, String) =
            |_| ("HTTP/1.1 403 Forbidden".into(), String::new());
        let (addr, _rx) = start_single_server(responder, Duration::ZERO);
        let url = format!("http://{addr}/push");
        let outcome = verify_handshake(
            &quick_client(Duration::from_secs(2)),
            &url,
            "tt12321",
            "mg_token",
        );

        assert!(!outcome.ok);
        assert!(outcome.message.contains("403"), "{outcome:?}");
    }

    #[test]
    fn dispatch_delivers_verbatim_body_with_derived_msg_type() {
        let responder: fn(&RecordedPost) -> (String, String) =
            |_| ("HTTP/1.1 200 OK".into(), "ok".into());
        let (addr, rx) = start_single_server(responder, Duration::ZERO);
        // 官方黄金样本 §5.19（客服消息 JSON，逐字）
        let plaintext = r#"{"ToUserName":"appid","FromUserName":"openid","CreateTime":1577364225,"MsgType":"text","Content":"text content"}"#;

        let outcome = dispatch(
            &quick_client(Duration::from_secs(2)),
            &format!("http://{addr}/push"),
            plaintext,
            "tt12321",
            "mg_token",
        );

        assert_eq!(outcome.status, 200);
        assert_eq!(outcome.error, None);
        let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!(request.body, plaintext, "body 必须逐字节透传");
        assert_eq!(
            request.header("x-msg-type").as_deref(),
            Some("douyin_microgame_im")
        );
        let nonce = request.header("x-nonce-str").expect("缺少 x-nonce-str");
        let timestamp = request.header("x-timestamp").expect("缺少 x-timestamp");
        assert_eq!(
            request.header("x-signature"),
            Some(signature(
                "tt12321",
                "douyin_microgame_im",
                &nonce,
                &timestamp,
                plaintext,
                "mg_token"
            ))
        );
        // 快照：发送唯一标识 = x-nonce-str，时间戳随回执返回
        assert_eq!(outcome.msg_id, nonce);
        assert_eq!(outcome.timestamp.as_deref(), Some(timestamp.as_str()));
    }
}
