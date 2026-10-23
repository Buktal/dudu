//! dop / 生活服务共用的 verify_webhook challenge 握手（事实库 §3.1「同款」）：
//! 平台保存回调 URL 时 POST 验证请求（Content-Type: application/json），
//! 目标须「解析出 challenge 值，并立即返回该 challenge 值作为响应」——
//! 放入 ResponseBody、text 格式的 JSON。签名头按体系算法由调用方注入
//! （dop=sha1(client_secret+body)、生活服务=sha1(AppSecret+去换行 body)）。

use super::super::{handshake_read_error, request_error_reason, HandshakeOutcome};

/// 构造 verify_webhook 验证请求体（challenge 为数字）。
pub(super) fn build_verify_body(client_key: &str, challenge: u64) -> String {
    serde_json::json!({
        "event": "verify_webhook",
        "client_key": client_key,
        "content": { "challenge": challenge }
    })
    .to_string()
}

/// 一个正的随机 challenge（rand 均匀采样全 u64 空间，`| 1` 保证非零；
/// 原 uuid 字节拼 u64 的取数式随 rand 入树退场）。
fn random_challenge() -> u64 {
    rand::random::<u64>() | 1
}

/// 校验目标是否在 ResponseBody 里以 text 格式 JSON 原样回显 challenge。
pub(super) fn check_echo(expected: u64, response_body: &str) -> Result<(), String> {
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
/// 私有协议原语：对外只经 [`super::Adapter`]（super::super::ChannelAdapter）路由。
pub(super) fn verify_handshake(
    client: &reqwest::blocking::Client,
    url: &str,
    client_key: &str,
    client_secret: &str,
    sign: fn(&str, &str) -> String,
    timeout_note: &str,
) -> HandshakeOutcome {
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
                message: format!("{}：{err}", request_error_reason(&err, timeout_note)),
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

    // 响应体读取失败显式归因（不折进空串误判「challenge 不一致」）
    let text = match response.text() {
        Ok(text) => text,
        Err(err) => {
            return HandshakeOutcome {
                ok: false,
                message: handshake_read_error(&err),
            };
        }
    };
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

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::connections::douyin::sha1_push;
    use crate::test_support::{quick_client, start_single_server, RecordedPost};

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

    #[test]
    fn handshake_succeeds_when_challenge_echoed() {
        let (addr, rx) = start_single_server(echo_ok, Duration::ZERO);
        let url = format!("http://{addr}/webhooks/douyin");
        let outcome = verify_handshake(
            &quick_client(Duration::from_secs(2)),
            &url,
            "tt_key",
            "tt_secret",
            sha1_push::sign_dop,
            "",
        );

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
            Some(sha1_push::sign_dop("tt_secret", &request.body))
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
    fn life_handshake_signs_newline_stripped_body() {
        // 生活服务与 dop 同款握手，差异只在签名算法（sha1(AppSecret + 去换行 body)）：
        // 请求体为单行 JSON，签名头应等于对该 body 的 life 版签名
        let (addr, rx) = start_single_server(echo_ok, Duration::ZERO);
        let url = format!("http://{addr}/hook");
        let outcome = verify_handshake(
            &quick_client(Duration::from_secs(2)),
            &url,
            "tt_key",
            "tt_secret",
            sha1_push::sign_life,
            "（官方要求 2.5 秒内应答）",
        );

        assert!(outcome.ok, "应成功：{outcome:?}");
        let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
        assert_eq!(
            request.header("X-Douyin-Signature"),
            Some(sha1_push::sign_life("tt_secret", &request.body))
        );
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
        let url = format!("http://{addr}/hook");
        let outcome = verify_handshake(
            &quick_client(Duration::from_secs(2)),
            &url,
            "tt_key",
            "tt_secret",
            sha1_push::sign_dop,
            "",
        );

        assert!(!outcome.ok);
        assert!(outcome.message.contains("不一致"), "{outcome:?}");
    }

    #[test]
    fn handshake_fails_on_non_200() {
        let responder: fn(&RecordedPost) -> (String, String) =
            |_| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
        let (addr, _rx) = start_single_server(responder, Duration::ZERO);
        let url = format!("http://{addr}/hook");
        let outcome = verify_handshake(
            &quick_client(Duration::from_secs(2)),
            &url,
            "tt_key",
            "tt_secret",
            sha1_push::sign_dop,
            "",
        );

        assert!(!outcome.ok);
        assert!(outcome.message.contains("500"), "{outcome:?}");
    }

    #[test]
    fn handshake_fails_on_timeout() {
        // 客户端 200ms 超时 vs 服务器 1s 延迟
        let (addr, _rx) = start_single_server(echo_ok, Duration::from_secs(1));
        let url = format!("http://{addr}/hook");
        let outcome = verify_handshake(
            &quick_client(Duration::from_millis(200)),
            &url,
            "tt_key",
            "tt_secret",
            sha1_push::sign_dop,
            "",
        );

        assert!(!outcome.ok);
        assert!(outcome.message.contains("超时"), "{outcome:?}");
    }
}
