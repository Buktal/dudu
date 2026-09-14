//! 抖音 dop Webhooks 协议实现。
//! 依据 docs/research/channels/douyin.md：
//! - 验证请求 POST `{"event":"verify_webhook","client_key":"","content":{"challenge":<数字>}}`
//! - 期望响应：text 格式 JSON `{"challenge":<同值>}`
//! - 签名头 X-Douyin-Signature = sha1(client_secret + body) 的 40 位小写 hex
//! - Msg-Id 头为去重键（本工具用 uuid v4）

use std::time::Duration;

use sha1::{Digest, Sha1};

use super::{ConnectionConfig, DispatchOutcome, HandshakeOutcome};

/// 官方算法：sha1(client_secret + body 字节) 的小写 hex。
pub fn sign(client_secret: &str, body: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(client_secret.as_bytes());
    hasher.update(body.as_bytes());
    hex::encode(hasher.finalize())
}

/// 构造 verify_webhook 验证请求体（challenge 为数字）。
pub fn build_verify_body(client_key: &str, challenge: u64) -> String {
    serde_json::json!({
        "event": "verify_webhook",
        "client_key": client_key,
        "content": { "challenge": challenge }
    })
    .to_string()
}

/// 从 uuid v4 派生一个正的随机 challenge（uuid 已在依赖内，不额外引随机库）。
fn random_challenge() -> u64 {
    let id = uuid::Uuid::new_v4();
    let bytes = id.as_bytes();
    u64::from_be_bytes([
        bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7],
    ]) | 1
}

/// 校验目标是否在 ResponseBody 里以 text 格式 JSON 原样回显 challenge。
pub fn check_echo(expected: u64, response_body: &str) -> Result<(), String> {
    let parsed: serde_json::Value = serde_json::from_str(response_body)
        .map_err(|_| format!("响应不是合法 JSON：{response_body}"))?;
    match parsed.get("challenge").and_then(|value| value.as_u64()) {
        Some(actual) if actual == expected => Ok(()),
        Some(actual) => Err(format!(
            "响应 challenge（{actual}）与请求（{expected}）不一致"
        )),
        None => Err(format!(
            "响应缺少数字类型的 challenge 字段：{response_body}"
        )),
    }
}

/// 按官方协议向目标发起 verify_webhook challenge 握手。
/// 成功 = HTTP 200 且 challenge 原样回显；失败返回原因（不匹配/非 200/网络错误/超时）。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let ConnectionConfig::Douyin {
        url,
        client_key,
        client_secret,
    } = config
    else {
        return HandshakeOutcome {
            ok: false,
            message: "配置不是抖音渠道，无法执行 verify_webhook 握手".into(),
        };
    };
    let challenge = random_challenge();
    let body = build_verify_body(client_key, challenge);
    let signature = sign(client_secret, &body);
    let msg_id = uuid::Uuid::new_v4().to_string();

    let response = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("X-Douyin-Signature", signature)
        .header("Msg-Id", msg_id)
        .body(body)
        .send();

    let response = match response {
        Ok(response) => response,
        Err(err) => {
            return HandshakeOutcome {
                ok: false,
                message: format!("{}：{err}", super::request_error_reason(&err, "")),
            };
        }
    };

    let status = response.status();
    if !status.is_success() {
        return HandshakeOutcome {
            ok: false,
            message: format!("目标返回 HTTP {status}，challenge 握手未通过"),
        };
    }

    let text = response.text().unwrap_or_default();
    match check_echo(challenge, &text) {
        Ok(()) => HandshakeOutcome {
            ok: true,
            message: format!("verify_webhook 握手成功：challenge {challenge} 原样回显（HTTP 200）"),
        },
        Err(reason) => HandshakeOutcome {
            ok: false,
            message: format!("HTTP 200 但 {reason}"),
        },
    }
}

/// 按抖音协议直发一条事件：body 是前端逐字节拼装的明文，
/// 这里只计算签名、构造头并 POST——字节透传，不重新解析/重排。
/// request_body 快照 = 明文（线上请求体即明文本身，超时/连接失败路径同样保留）。
/// 私有协议原语：对外只经 [`Adapter`]（super::ChannelAdapter）路由。
fn dispatch_event(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
    body: &str,
) -> DispatchOutcome {
    let ConnectionConfig::Douyin {
        url,
        client_secret,
        ..
    } = config
    else {
        return DispatchOutcome::not_sent("配置不是抖音渠道，无法直发");
    };
    let signature = sign(client_secret, body);
    let msg_id = uuid::Uuid::new_v4().to_string();
    let started = std::time::Instant::now();

    let response = client
        .post(url)
        .header("Content-Type", "application/json")
        .header("X-Douyin-Signature", signature.clone())
        .header("Msg-Id", msg_id.clone())
        .body(body.to_string())
        .send();

    let elapsed_ms = started.elapsed().as_millis() as u64;
    match response {
        Ok(response) => DispatchOutcome {
            msg_id,
            signature,
            timestamp: None,
            request_body: Some(body.to_string()),
            reply: None,
            status: response.status().as_u16(),
            elapsed_ms,
            body: response.text().unwrap_or_default(),
            error: None,
        },
        Err(err) => DispatchOutcome {
            msg_id,
            signature,
            timestamp: None,
            request_body: Some(body.to_string()),
            reply: None,
            status: 0,
            elapsed_ms,
            body: String::new(),
            error: Some(format!("{}：{err}", super::request_error_reason(&err, ""))),
        },
    }
}

/// 抖音渠道适配器：[`super::ChannelAdapter`] 的抖音实现——
/// 签名/头构造/载荷格式全部复用本模块的协议原语，不对外暴露。
pub(crate) struct Adapter;

impl super::ChannelAdapter for Adapter {
    fn id(&self) -> &'static str {
        "douyin"
    }

    fn label(&self) -> &'static str {
        "抖音"
    }

    fn matches(&self, config: &ConnectionConfig) -> bool {
        matches!(config, ConnectionConfig::Douyin { .. })
    }

    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str> {
        let ConnectionConfig::Douyin { url, .. } = config else {
            return None;
        };
        Some(url)
    }

    fn handshake_client(&self) -> reqwest::blocking::Client {
        // 生产用默认客户端：抖音连接超过 5s 自动断开，本地留 5s 上限
        // （握手与直发共用同一超时上限）
        super::client_with_timeout(Duration::from_secs(5))
    }

    fn verify_handshake(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
    ) -> HandshakeOutcome {
        verify_handshake(client, config)
    }

    fn dispatch_event(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
        body: &str,
    ) -> DispatchOutcome {
        dispatch_event(client, config, body)
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::test_support::{quick_client, start_single_server, RecordedPost};

    #[test]
    fn sign_matches_known_sha1_vector() {
        // 独立来源：FIPS 180-1 测试向量 sha1("abc")
        // = a9993e364706816aba3e25717850c26c9cd0d89d
        // 对应 client_secret="abc"、body 为空的官方算法拼接。
        assert_eq!(sign("abc", ""), "a9993e364706816aba3e25717850c26c9cd0d89d");
    }

    #[test]
    fn sign_is_40_char_lowercase_hex() {
        let signature = sign("secret", r#"{"event":"verify_webhook"}"#);
        assert_eq!(signature.len(), 40);
        assert!(signature
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
    }

    #[test]
    fn build_verify_body_matches_official_schema() {
        // 官方文档逐字示例：challenge 为数字，置于 content 对象内。
        let body = build_verify_body("tt_key", 12345);
        let parsed: serde_json::Value = serde_json::from_str(&body).unwrap();
        let expected: serde_json::Value = serde_json::json!({
            "event": "verify_webhook",
            "client_key": "tt_key",
            "content": { "challenge": 12345 }
        });
        assert_eq!(parsed, expected);
    }

    #[test]
    fn check_echo_accepts_matching_challenge_as_text_json() {
        // 官方要求：challenge 值放入 ResponseBody，text 格式的 JSON。
        assert!(check_echo(12345, r#"{"challenge":12345}"#).is_ok());
    }

    #[test]
    fn check_echo_rejects_mismatched_or_malformed_response() {
        assert!(check_echo(12345, r#"{"challenge":999}"#).is_err());
        assert!(check_echo(12345, "not json").is_err());
        assert!(check_echo(12345, r#"{}"#).is_err());
        // challenge 必须是数字：字符串回显不通过
        assert!(check_echo(12345, r#"{"challenge":"12345"}"#).is_err());
    }

    // ---- 握手全链路：本地 TcpListener 极简监听演示成功/失败两条路径 ----

    fn challenge_of(body: &str) -> u64 {
        serde_json::from_str::<serde_json::Value>(body)
            .unwrap()
            .pointer("/content/challenge")
            .and_then(|value| value.as_u64())
            .unwrap()
    }

    fn echo_ok(request: &RecordedPost) -> (String, String) {
        // 官方期望的成功实现：解析 challenge 后原样回显
        let challenge = challenge_of(&request.body);
        (
            "HTTP/1.1 200 OK".into(),
            format!("{{\"challenge\":{challenge}}}"),
        )
    }

    fn config_with_url(url: String) -> ConnectionConfig {
        ConnectionConfig::Douyin {
            url,
            client_key: "tt_key".into(),
            client_secret: "tt_secret".into(),
        }
    }

    #[test]
    fn handshake_succeeds_when_challenge_echoed() {
        let (addr, rx) = start_single_server(echo_ok, Duration::ZERO);
        let config = config_with_url(format!("http://{addr}/webhooks/douyin"));
        let outcome = verify_handshake(&quick_client(Duration::from_secs(2)), &config);

        assert!(outcome.ok, "应成功：{outcome:?}");
        assert!(outcome.message.contains("原样回显"));

        // 请求侧逐项核对官方协议要素
        let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert!(request.request_line.starts_with("POST /webhooks/douyin"));
        assert_eq!(
            request.header("Content-Type").as_deref(),
            Some("application/json")
        );
        // 签名头 = sha1hex(client_secret + 实际发送的 body 字节)（算法已由已知向量独立验证）
        assert_eq!(
            request.header("X-Douyin-Signature"),
            Some(sign("tt_secret", &request.body))
        );
        // Msg-Id 为去重键：uuid v4 形态（8-4-4-4-12，版本位 4）
        let msg_id = request.header("Msg-Id").expect("缺少 Msg-Id 头");
        let parts: Vec<&str> = msg_id.split('-').collect();
        assert_eq!(
            parts.iter().map(|p| p.len()).collect::<Vec<_>>(),
            vec![8, 4, 4, 4, 12],
            "Msg-Id 应为 uuid：{msg_id}"
        );
        assert!(msg_id.starts_with(|c: char| c.is_ascii_hexdigit()));
        assert_eq!(&msg_id[14..15], "4");
        // body 结构
        let parsed: serde_json::Value = serde_json::from_str(&request.body).unwrap();
        assert_eq!(parsed["event"], "verify_webhook");
        assert_eq!(parsed["client_key"], "tt_key");
        assert!(parsed["content"]["challenge"].is_u64());
    }

    #[test]
    fn handshake_fails_when_challenge_not_echoed() {
        let wrong = |_request: &RecordedPost| {
            (
                "HTTP/1.1 200 OK".to_string(),
                r#"{"challenge":999}"#.to_string(),
            )
        };
        let responder: fn(&RecordedPost) -> (String, String) = wrong;
        let (addr, _rx) = start_single_server(responder, Duration::ZERO);
        let config = config_with_url(format!("http://{addr}/hook"));
        let outcome = verify_handshake(&quick_client(Duration::from_secs(2)), &config);

        assert!(!outcome.ok);
        assert!(outcome.message.contains("不一致"), "{outcome:?}");
    }

    #[test]
    fn handshake_fails_on_non_200() {
        let responder: fn(&RecordedPost) -> (String, String) =
            |_| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
        let (addr, _rx) = start_single_server(responder, Duration::ZERO);
        let config = config_with_url(format!("http://{addr}/hook"));
        let outcome = verify_handshake(&quick_client(Duration::from_secs(2)), &config);

        assert!(!outcome.ok);
        assert!(outcome.message.contains("500"), "{outcome:?}");
    }

    #[test]
    fn handshake_fails_on_timeout() {
        // 客户端 200ms 超时 vs 服务器 1s 延迟
        let (addr, _rx) = start_single_server(echo_ok, Duration::from_secs(1));
        let config = config_with_url(format!("http://{addr}/hook"));
        let outcome = verify_handshake(&quick_client(Duration::from_millis(200)), &config);

        assert!(!outcome.ok);
        assert!(outcome.message.contains("超时"), "{outcome:?}");
    }

    // ---- 直发全链路：本地 TcpListener 覆盖 成功 200 / 非 200 / 超时 三路径 ----

    #[test]
    fn dispatch_delivers_signed_body_verbatim_and_returns_receipt() {
        let responder: fn(&RecordedPost) -> (String, String) = |_| {
            ("HTTP/1.1 200 OK".into(), "ok".into())
        };
        let (addr, rx) = start_single_server(responder, Duration::ZERO);
        let config = config_with_url(format!("http://{addr}/webhooks/douyin"));
        // 前端逐字节拼装的明文（含非 ASCII，验证 UTF-8 字节透传）
        let plaintext = r#"{"event":"im_receive_msg","content":{"text":"你好，抖音"}}"#;

        let outcome = dispatch_event(
            &quick_client(Duration::from_secs(2)),
            &config,
            plaintext,
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
        // 签名头 = sha1hex(client_secret + 实际发送的 body 字节)
        assert_eq!(
            request.header("X-Douyin-Signature"),
            Some(sign("tt_secret", plaintext))
        );
        // 返回的签名头快照与实际发送一致
        assert_eq!(outcome.signature, sign("tt_secret", plaintext));
        // Msg-Id 为 uuid v4 且与返回快照一致
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
        let responder: fn(&RecordedPost) -> (String, String) = |_| {
            ("HTTP/1.1 500 Internal Server Error".into(), "boom".into())
        };
        let (addr, _rx) = start_single_server(responder, Duration::ZERO);
        let config = config_with_url(format!("http://{addr}/hook"));

        let outcome = dispatch_event(
            &quick_client(Duration::from_secs(2)),
            &config,
            r#"{"event":"im_message_read"}"#,
        );

        assert_eq!(outcome.status, 500);
        assert_eq!(outcome.body, "boom");
        assert_eq!(outcome.error, None, "非 200 是回执事实，不是发送错误");
    }

    #[test]
    fn dispatch_reports_timeout_without_response() {
        let (addr, _rx) = start_single_server(echo_ok, Duration::from_secs(1));
        let config = config_with_url(format!("http://{addr}/hook"));

        let outcome = dispatch_event(
            &quick_client(Duration::from_millis(200)),
            &config,
            r#"{"event":"im_receive_msg"}"#,
        );

        assert_eq!(outcome.status, 0, "未收到响应时 status 为 0");
        let error = outcome.error.clone().expect("应有错误原因");
        assert!(error.contains("超时"), "{outcome:?}");
        assert_eq!(outcome.body, "");
    }
}
