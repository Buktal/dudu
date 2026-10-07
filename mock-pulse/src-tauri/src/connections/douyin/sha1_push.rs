//! dop / 生活服务共用的 X-Douyin-Signature 直发管线（事实库 §4.1「dop / 生活服务」）。
//! 头集合一致（Content-Type: application/json + X-Douyin-Signature + Msg-Id），
//! 差异只在签名算法与应答窗口：
//! - dop 官方算法（Go 示例逐字语义）：sha1(client_secret + body 字节) 小写 hex
//! - 生活服务：body 先按行拼接去掉换行符再参与 sha1（官方 wholeStr 逐行
//!   readLine 拼接 / Node demo `split(/\r?\n/).join('')`），key 用 AppSecret

use super::super::{no_reply, send_measured_outcome, DispatchOutcome, DispatchSnapshot};
use crate::connections::util;

/// dop 官方算法：sha1(client_secret + body) 的小写 hex。
pub(crate) fn sign_dop(client_secret: &str, body: &str) -> String {
    util::sha1_hex(&[client_secret, body])
}

/// 生活服务版：sha1(AppSecret + 去换行 body) 的小写 hex。
pub(super) fn sign_life(client_secret: &str, body: &str) -> String {
    let whole_str: String = body.lines().collect::<Vec<_>>().concat();
    util::sha1_hex(&[client_secret, &whole_str])
}

/// 直发一条事件：body 是前端逐字节拼装的明文，
/// 这里只挂签名/头并 POST——字节透传，不重新解析/重排。
/// request_body 快照 = 明文（线上请求体即明文本身，超时/连接失败路径同样保留）。
/// 私有协议原语：对外只经 [`super::super::ChannelAdapter`] 路由。
pub(super) fn dispatch(
    client: &reqwest::blocking::Client,
    url: &str,
    body: &str,
    signature: String,
    timeout_note: &str,
) -> DispatchOutcome {
    let msg_id = uuid::Uuid::new_v4().to_string();
    let request = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("X-Douyin-Signature", signature.clone())
        .header("Msg-Id", msg_id.clone())
        .body(body.to_string());
    send_measured_outcome(
        request,
        timeout_note,
        DispatchSnapshot {
            msg_id,
            signature,
            timestamp: None,
            request_body: Some(body.to_string()),
        },
        no_reply,
    )
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::test_support::{quick_client, start_single_server, RecordedPost};

    #[test]
    fn sign_dop_matches_known_sha1_vector() {
        // 独立来源：FIPS 180-1 测试向量 sha1("abc")
        // 对应 client_secret="abc"、body 为空的官方算法拼接。
        assert_eq!(sign_dop("abc", ""), "a9993e364706816aba3e25717850c26c9cd0d89d");
    }

    #[test]
    fn sign_dop_is_40_char_lowercase_hex() {
        let signature = sign_dop("secret", r#"{"event":"verify_webhook"}"#);
        assert_eq!(signature.len(), 40);
        assert!(signature
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
    }

    #[test]
    fn sign_life_hashes_newline_stripped_body() {
        // 事实库 §4.1：生活服务 = sha1(AppSecret + 去换行 body)。
        // 黄金向量按官方算法以 Node crypto 独立复算：AppSecret="AppSecret"，
        // 多行 body 去换行后拼成单行 JSON 参与 sha1。
        let multiline = "{\n\"event\":\"life_trade_order_notify\",\n\"client_key\":\"axxxxxxxxxxxxx\"\n}";
        assert_eq!(
            sign_life("AppSecret", multiline),
            "9fe1812b5f4dfe1ec47ba0b39efdf2c7647e87c7"
        );
        // 与 dop 算法在"body 本就无换行"时一致（同族差异只在换行预处理）
        assert_eq!(
            sign_life("abc", ""),
            "a9993e364706816aba3e25717850c26c9cd0d89d"
        );
    }

    #[test]
    fn dispatch_delivers_signed_body_verbatim_and_returns_receipt() {
        let responder: fn(&RecordedPost) -> (String, String) =
            |_| ("HTTP/1.1 200 OK".into(), "ok".into());
        let (addr, rx) = start_single_server(responder, Duration::ZERO);
        let url = format!("http://{addr}/webhooks/douyin");
        // 前端逐字节拼装的明文（含非 ASCII，验证 UTF-8 字节透传）
        let plaintext = r#"{"event":"im_receive_msg","content":{"text":"你好，抖音"}}"#;

        let outcome = dispatch(
            &quick_client(Duration::from_secs(2)),
            &url,
            plaintext,
            sign_dop("tt_secret", plaintext),
            "",
        );

        assert_eq!(outcome.status, 200);
        assert_eq!(outcome.body, "ok");
        assert_eq!(outcome.error, None);
        assert!(outcome.elapsed_ms < 2_000, "{outcome:?}");

        // 请求侧逐项核对官方协议要素
        let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(request.request_line.starts_with("POST /webhooks/douyin"));
        assert_eq!(request.body, plaintext, "body 必须逐字节透传");
        assert_eq!(
            request.header("Content-Type").as_deref(),
            Some("application/json")
        );
        // 签名头 = sha1hex(client_secret + 实际发送的 body 字节)（算法已由已知向量独立验证）
        assert_eq!(
            request.header("X-Douyin-Signature"),
            Some(sign_dop("tt_secret", plaintext))
        );
        // 返回的签名头快照与实际发送一致
        assert_eq!(outcome.signature, sign_dop("tt_secret", plaintext));
        // Msg-Id 为去重键：uuid v4 形态（8-4-4-4-12，版本位 4）
        let msg_id = request.header("Msg-Id").expect("缺少 Msg-Id 头");
        assert_eq!(msg_id, outcome.msg_id);
        let parts: Vec<&str> = msg_id.split('-').collect();
        assert_eq!(
            parts.iter().map(|p| p.len()).collect::<Vec<_>>(),
            vec![8, 4, 4, 4, 12],
            "Msg-Id 应为 uuid：{msg_id}"
        );
        assert_eq!(&msg_id[14..15], "4");
    }

    #[test]
    fn dispatch_returns_non_200_status_and_body() {
        let responder: fn(&RecordedPost) -> (String, String) =
            |_| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
        let (addr, _rx) = start_single_server(responder, Duration::ZERO);
        let url = format!("http://{addr}/hook");

        let outcome = dispatch(
            &quick_client(Duration::from_secs(2)),
            &url,
            r#"{"event":"im_message_read"}"#,
            sign_dop("tt_secret", r#"{"event":"im_message_read"}"#),
            "",
        );

        assert_eq!(outcome.status, 500);
        assert_eq!(outcome.body, "boom");
        assert_eq!(outcome.error, None, "非 200 是回执事实，不是发送错误");
    }

    #[test]
    fn dispatch_reports_timeout_with_system_window_note() {
        let responder: fn(&RecordedPost) -> (String, String) =
            |_| ("HTTP/1.1 200 OK".into(), "ok".into());
        let (addr, _rx) = start_single_server(responder, Duration::from_secs(1));
        let url = format!("http://{addr}/hook");

        let outcome = dispatch(
            &quick_client(Duration::from_millis(200)),
            &url,
            r#"{"event":"im_receive_msg"}"#,
            sign_dop("tt_secret", r#"{"event":"im_receive_msg"}"#),
            "（官方要求 2.5 秒内应答）",
        );

        assert_eq!(outcome.status, 0, "未收到响应时 status 为 0");
        let error = outcome.error.clone().expect("应有错误原因");
        assert!(error.contains("超时"), "{outcome:?}");
        assert!(error.contains("2.5 秒"), "{outcome:?}");
        assert_eq!(outcome.body, "");
    }
}
