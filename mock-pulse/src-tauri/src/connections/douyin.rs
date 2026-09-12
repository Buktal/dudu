//! 抖音 dop Webhooks 协议实现。
//! 依据 docs/research/channels/douyin.md：
//! - 验证请求 POST `{"event":"verify_webhook","client_key":"","content":{"challenge":<数字>}}`
//! - 期望响应：text 格式 JSON `{"challenge":<同值>}`
//! - 签名头 X-Douyin-Signature = sha1(client_secret + body) 的 40 位小写 hex
//! - Msg-Id 头为去重键（本工具用 uuid v4）

use std::time::Duration;

use serde::{Deserialize, Serialize};
use sha1::{Digest, Sha1};

use super::ConnectionConfig;

/// 握手结果：ok + 人类可读原因（前端直接展示）。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HandshakeOutcome {
    pub ok: bool,
    pub message: String,
}

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
pub fn verify_handshake(
    client: &reqwest::blocking::Client,
    config: &ConnectionConfig,
) -> HandshakeOutcome {
    let challenge = random_challenge();
    let body = build_verify_body(&config.client_key, challenge);
    let signature = sign(&config.client_secret, &body);
    let msg_id = uuid::Uuid::new_v4().to_string();

    let response = client
        .post(&config.url)
        .header("Content-Type", "application/json")
        .header("X-Douyin-Signature", signature)
        .header("Msg-Id", msg_id)
        .body(body)
        .send();

    let response = match response {
        Ok(response) => response,
        Err(err) => {
            let reason = if err.is_timeout() {
                "等待响应超时".to_string()
            } else if err.is_connect() {
                "无法连接到目标地址".to_string()
            } else {
                "请求发送失败".to_string()
            };
            return HandshakeOutcome {
                ok: false,
                message: format!("{reason}：{err}"),
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

/// 生产用默认客户端：抖音连接超过 5s 自动断开，本地留 5s 上限。
pub fn handshake_client() -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .expect("构造 reqwest 客户端失败")
}

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};
    use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
    use std::sync::mpsc::{channel, Receiver};
    use std::time::Duration;

    use super::*;

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

    #[derive(Clone)]
    struct RecordedRequest {
        request_line: String,
        head: String,
        body: String,
    }

    impl RecordedRequest {
        fn header(&self, name: &str) -> Option<String> {
            self.head.lines().find_map(|line| {
                let (key, value) = line.split_once(':')?;
                if key.trim().eq_ignore_ascii_case(name) {
                    Some(value.trim().to_string())
                } else {
                    None
                }
            })
        }
    }

    fn read_head_and_body(stream: &mut TcpStream) -> RecordedRequest {
        let mut buf = Vec::new();
        let mut chunk = [0u8; 4096];
        loop {
            let n = stream.read(&mut chunk).unwrap();
            assert!(n > 0, "客户端提前断开");
            buf.extend_from_slice(&chunk[..n]);
            if let Some(split) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
                let head = String::from_utf8_lossy(&buf[..split]).to_string();
                let content_length = head
                    .lines()
                    .find_map(|line| {
                        let (k, v) = line.split_once(':')?;
                        if k.trim().eq_ignore_ascii_case("content-length") {
                            v.trim().parse::<usize>().ok()
                        } else {
                            None
                        }
                    })
                    .unwrap_or(0);
                if buf.len() >= split + 4 + content_length {
                    let request_line = head.lines().next().unwrap_or_default().to_string();
                    let body = String::from_utf8_lossy(&buf[split + 4..split + 4 + content_length])
                        .to_string();
                    return RecordedRequest {
                        request_line,
                        head,
                        body,
                    };
                }
            }
        }
    }

    fn challenge_of(body: &str) -> u64 {
        serde_json::from_str::<serde_json::Value>(body)
            .unwrap()
            .pointer("/content/challenge")
            .and_then(|value| value.as_u64())
            .unwrap()
    }

    /// 起一个只处理一次请求的本地监听；responder 决定状态行与响应体。
    fn start_server(
        responder: fn(&RecordedRequest) -> (String, String),
        delay: Duration,
    ) -> (SocketAddr, Receiver<RecordedRequest>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let (tx, rx) = channel();
        std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let request = read_head_and_body(&mut stream);
            tx.send(request.clone()).unwrap();
            std::thread::sleep(delay);
            let (status_line, body) = responder(&request);
            let response = format!(
                "{status_line}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            stream.write_all(response.as_bytes()).unwrap();
            stream.shutdown(Shutdown::Both).unwrap();
        });
        (addr, rx)
    }

    fn echo_ok(request: &RecordedRequest) -> (String, String) {
        // 官方期望的成功实现：解析 challenge 后原样回显
        let challenge = challenge_of(&request.body);
        (
            "HTTP/1.1 200 OK".into(),
            format!("{{\"challenge\":{challenge}}}"),
        )
    }

    fn quick_client(timeout: Duration) -> reqwest::blocking::Client {
        reqwest::blocking::Client::builder()
            .timeout(timeout)
            .build()
            .unwrap()
    }

    fn config_with_url(url: String) -> ConnectionConfig {
        ConnectionConfig {
            channel: "douyin".into(),
            url,
            client_key: "tt_key".into(),
            client_secret: "tt_secret".into(),
        }
    }

    #[test]
    fn handshake_succeeds_when_challenge_echoed() {
        let (addr, rx) = start_server(echo_ok, Duration::ZERO);
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
        let wrong = |_request: &RecordedRequest| {
            (
                "HTTP/1.1 200 OK".to_string(),
                r#"{"challenge":999}"#.to_string(),
            )
        };
        let responder: fn(&RecordedRequest) -> (String, String) = wrong;
        let (addr, _rx) = start_server(responder, Duration::ZERO);
        let config = config_with_url(format!("http://{addr}/hook"));
        let outcome = verify_handshake(&quick_client(Duration::from_secs(2)), &config);

        assert!(!outcome.ok);
        assert!(outcome.message.contains("不一致"), "{outcome:?}");
    }

    #[test]
    fn handshake_fails_on_non_200() {
        let responder: fn(&RecordedRequest) -> (String, String) =
            |_| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
        let (addr, _rx) = start_server(responder, Duration::ZERO);
        let config = config_with_url(format!("http://{addr}/hook"));
        let outcome = verify_handshake(&quick_client(Duration::from_secs(2)), &config);

        assert!(!outcome.ok);
        assert!(outcome.message.contains("500"), "{outcome:?}");
    }

    #[test]
    fn handshake_fails_on_timeout() {
        // 客户端 200ms 超时 vs 服务器 1s 延迟
        let (addr, _rx) = start_server(echo_ok, Duration::from_secs(1));
        let config = config_with_url(format!("http://{addr}/hook"));
        let outcome = verify_handshake(&quick_client(Duration::from_millis(200)), &config);

        assert!(!outcome.ok);
        assert!(outcome.message.contains("超时"), "{outcome:?}");
    }
}
