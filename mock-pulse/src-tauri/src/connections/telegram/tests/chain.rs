//! 探针与直发全链路（本地 TcpListener）：恒等头原样携带可核（原样比对
//! 验证链路）+ 官方 §5.2 探针样本逐字节透传 + secret_token 缺失/不合法
//! 直发前拒绝（缺失/超 256 字符/非法字符边界）+ 2XY 应答语义 + 非 200/
//! 超时回执 + 配置判别。

use std::io::Write;
use std::net::{Shutdown, SocketAddr, TcpListener};
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;

use crate::connections::ConnectionConfig;
use crate::test_support::{quick_client, read_head_and_body};

use super::*;

// ---- 网络基建 ----

/// 录制到的请求：请求行 + 全部头 + body。
#[derive(Clone)]
struct Recorded {
    request_line: String,
    head: String,
    body: String,
}

/// 起一个只处理一次请求的本地监听（探针/直发共用）；responder 决定状态行
/// 与响应体。
fn start_request_server(
    responder: impl Fn(&Recorded) -> (String, String) + Send + 'static,
    delay: Duration,
) -> (SocketAddr, Receiver<Recorded>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let (tx, rx) = channel();
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let (head, body) = read_head_and_body(&mut stream);
        let request = Recorded {
            request_line: crate::test_support::request_line_of(&head),
            head,
            body,
        };
        tx.send(request.clone()).unwrap();
        std::thread::sleep(delay);
        let (status_line, response_body) = responder(&request);
        let response = format!(
            "{status_line}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response_body}",
            response_body.len()
        );
        stream.write_all(response.as_bytes()).unwrap();
        stream.shutdown(Shutdown::Both).unwrap();
    });
    (addr, rx)
}

/// 恒等头取值（大小写不敏感取头，Telegram 官方语义 = 与配置 secret_token
/// 字符串相等比较——本侧独立复现接收侧原样比对）。
fn secret_token_header_of(request: &Recorded) -> Option<String> {
    request.head.lines().find_map(|line| {
        line.split_once(':')
            .filter(|(key, _)| {
                key.trim()
                    .eq_ignore_ascii_case("x-telegram-bot-api-secret-token")
            })
            .map(|(_, value)| value.trim().to_string())
    })
}

// ---- 推送探针（§3.2 无 challenge，探针语义同普通推送） ----

#[test]
fn probe_posts_official_update_with_identity_header() {
    let (addr, rx) = start_request_server(
        |request| {
            // 接收侧原样比对（§4.1）：头值与配置 secret_token 字符串相等
            assert_eq!(
                secret_token_header_of(request).as_deref(),
                Some(GOLDEN_SECRET_TOKEN),
                "恒等头应与连接配置的 Secret Token 原样一致"
            );
            // 官方自测样本（§5.2）逐字节透传
            assert_eq!(request.body, GOLDEN_PROBE_PLAINTEXT);
            // 成功判 2XY（应答正文无口径）
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let config = telegram_config(format!("http://{addr}/webhooks/telegram"));
    let outcome = verify_handshake(&client(), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("2XY"), "{outcome:?}");
    assert!(outcome.message.contains("无 HMAC"), "{outcome:?}");

    // 请求侧逐项核对官方协议要素
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert!(
        request.request_line.starts_with("POST "),
        "探针为 POST：{}",
        request.request_line
    );
    assert!(
        !request.request_line.contains('?'),
        "官方 Webhook POST 不带 query：{}",
        request.request_line
    );
    assert!(
        request
            .head
            .to_ascii_lowercase()
            .contains("content-type: application/json"),
        "POST 应带 JSON Content-Type：{}",
        request.head
    );
    assert_eq!(request.body, GOLDEN_PROBE_PLAINTEXT);
}

#[test]
fn probe_fails_on_non_2xy() {
    // 官方成功判 2XY；404 等非 2XY 即探针未通过
    let not_found = |_request: &Recorded| ("HTTP/1.1 404 Not Found".into(), String::new());
    let (addr, _rx) = start_request_server(not_found, Duration::ZERO);
    let config = telegram_config(format!("http://{addr}/webhooks/telegram"));
    let outcome = verify_handshake(&client(), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("404"), "{outcome:?}");
    assert!(outcome.message.contains("探针"), "{outcome:?}");
}

#[test]
fn probe_reports_timeout_with_retry_note() {
    // 官方非 2XY 才重推且时刻表未公开；客户端 200ms 超时 vs 服务器 1s 延迟
    let slow = |_request: &Recorded| ("HTTP/1.1 200 OK".into(), String::new());
    let (addr, _rx) = start_request_server(slow, Duration::from_secs(1));
    let config = telegram_config(format!("http://{addr}/webhooks/telegram"));
    let outcome = verify_handshake(&quick_client(Duration::from_millis(200)), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("超时"), "{outcome:?}");
    assert!(outcome.message.contains("合理次数"), "{outcome:?}");
}

// ---- JSON Update 直发（恒等头 + update_id 幂等键） ----

#[test]
fn dispatch_posts_update_verbatim_and_snapshots_update_id() {
    let (addr, _rx) = start_request_server(
        |request| {
            // 接收侧原样比对验证链路：头值与配置逐字符一致
            assert_eq!(
                secret_token_header_of(request).as_deref(),
                Some(GOLDEN_SECRET_TOKEN)
            );
            ("HTTP/1.1 204 No Content".into(), String::new())
        },
        Duration::ZERO,
    );
    let config = telegram_config(format!("http://{addr}/webhooks/telegram"));

    let outcome = dispatch_event(&client(), &config, GOLDEN_PROBE_PLAINTEXT);

    assert_eq!(outcome.status, 204, "2XY 语义：204 亦属成功");
    assert_eq!(outcome.error, None);
    assert_eq!(outcome.reply, None);
    // 明文逐字节透传（ADR-0001）
    assert_eq!(
        outcome.request_body.as_deref(),
        Some(GOLDEN_PROBE_PLAINTEXT)
    );
    // 幂等键快照：update_id（§2.1 去重/恢复顺序）；签名快照即恒等头值
    assert_eq!(outcome.msg_id, "10000");
    assert_eq!(outcome.signature, GOLDEN_SECRET_TOKEN);
    // 无 query/时间戳要素（官方 Webhook POST 仅头 + body）
    assert_eq!(outcome.timestamp, None);
}

#[test]
fn dispatch_snapshots_update_id_across_update_types() {
    let ok = |_request: &Recorded| ("HTTP/1.1 200 OK".into(), String::new());
    let (addr, _rx) = start_request_server(ok, Duration::ZERO);
    let config = telegram_config(format!("http://{addr}/webhooks/telegram"));

    // callback_query 代表（§5.2 样本压单行）：update_id 快照同语义
    let outcome = dispatch_event(&client(), &config, GOLDEN_CALLBACK_PLAINTEXT);
    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.msg_id, "10000");
    assert_eq!(
        outcome.request_body.as_deref(),
        Some(GOLDEN_CALLBACK_PLAINTEXT)
    );
}

#[test]
fn dispatch_reports_non_2xy_status_and_body() {
    let boom = |_request: &Recorded| {
        (
            "HTTP/1.1 500 Internal Server Error".into(),
            "boom".to_string(),
        )
    };
    let (addr, _rx) = start_request_server(boom, Duration::ZERO);
    let config = telegram_config(format!("http://{addr}/webhooks/telegram"));

    let outcome = dispatch_event(&client(), &config, GOLDEN_PROBE_PLAINTEXT);

    assert_eq!(outcome.status, 500);
    assert_eq!(outcome.body, "boom");
    assert_eq!(outcome.error, None, "非 2XY 是回执事实，不是发送错误");
}

// ---- secret_token 边界（缺失 / 不匹配形态 / 1–256 字符边界） ----

#[test]
fn dispatch_rejects_missing_secret_token_before_sending() {
    let ok = |_request: &Recorded| ("HTTP/1.1 200 OK".into(), String::new());
    let (addr, _rx) = start_request_server(ok, Duration::ZERO);
    let config = ConnectionConfig::Telegram {
        url: format!("http://{addr}/webhooks/telegram"),
        secret_token: String::new(),
    };

    let outcome = dispatch_event(&client(), &config, GOLDEN_PROBE_PLAINTEXT);

    assert_eq!(outcome.status, 0, "未发出请求");
    assert_eq!(outcome.request_body, None);
    let error = outcome.error.expect("应有拒绝原因");
    assert!(error.contains("未配置"), "{error:?}");
}

#[test]
fn dispatch_rejects_secret_token_over_256_chars() {
    let ok = |_request: &Recorded| ("HTTP/1.1 200 OK".into(), String::new());
    let (addr, _rx) = start_request_server(ok, Duration::ZERO);
    let config = ConnectionConfig::Telegram {
        url: format!("http://{addr}/webhooks/telegram"),
        // 上边界 +1：257 字符越限（真实 setWebhook 拒收 1–256 之外的值）
        secret_token: "a".repeat(257),
    };

    let outcome = dispatch_event(&client(), &config, GOLDEN_PROBE_PLAINTEXT);

    assert_eq!(outcome.status, 0, "越限 token 不应发出请求");
    assert_eq!(outcome.signature, "", "未发出请求即无头值快照");
    let error = outcome.error.expect("应有拒绝原因");
    assert!(error.contains("1–256"), "{error:?}");
}

#[test]
fn dispatch_carries_256_char_boundary_token_verbatim() {
    // 上边界：恰 256 字符合法，且原样进头（原样比对链路在边界值仍成立）
    let charset = b"Aa0_-";
    let token: String = (0..256)
        .map(|index| charset[index % charset.len()] as char)
        .collect();
    assert_eq!(token.len(), 256);
    let expected = token.clone();
    let (addr, rx) = start_request_server(
        move |request| {
            assert_eq!(
                secret_token_header_of(request).as_deref(),
                Some(expected.as_str()),
                "边界 token 应原样进头"
            );
            ("HTTP/1.1 200 OK".into(), String::new())
        },
        Duration::ZERO,
    );
    let config = ConnectionConfig::Telegram {
        url: format!("http://{addr}/webhooks/telegram"),
        secret_token: token.clone(),
    };

    let outcome = dispatch_event(&client(), &config, GOLDEN_PROBE_PLAINTEXT);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.signature, token);
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(
        secret_token_header_of(&request).as_deref(),
        Some(token.as_str())
    );
}

#[test]
fn dispatch_rejects_secret_token_with_foreign_characters() {
    let ok = |_request: &Recorded| ("HTTP/1.1 200 OK".into(), String::new());
    let (addr, _rx) = start_request_server(ok, Duration::ZERO);
    let config = ConnectionConfig::Telegram {
        url: format!("http://{addr}/webhooks/telegram"),
        // 官方字符集仅 A-Za-z0-9_-：空格/加号/等号均越限
        secret_token: "bad token+value=".into(),
    };

    let outcome = dispatch_event(&client(), &config, GOLDEN_PROBE_PLAINTEXT);

    assert_eq!(outcome.status, 0, "非法字符 token 不应发出请求");
    let error = outcome.error.expect("应有拒绝原因");
    assert!(error.contains("A-Z"), "{error:?}");
}

// ---- 配置判别 ----

#[test]
fn dispatch_and_probe_reject_non_telegram_config() {
    let config = ConnectionConfig::Qq {
        url: "http://127.0.0.1:1/hook".into(),
        app_id: "11111111".into(),
        app_secret: "DG5g3B4j9X2KOErG".into(),
    };

    let outcome = dispatch_event(&client(), &config, "{}");
    assert_eq!(outcome.status, 0);
    assert!(outcome.error.unwrap().contains("不是 Telegram 渠道"));

    let probe = verify_handshake(&client(), &config);
    assert!(!probe.ok);
    assert!(probe.message.contains("不是 Telegram 渠道"));
}
