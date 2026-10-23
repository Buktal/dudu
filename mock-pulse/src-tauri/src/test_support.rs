//! 测试基建共享单点：本地 TcpListener 起停 + 请求录制 + 超时客户端。
//! 经 lib.rs 以 `#[cfg(test)]` 挂载，只在 cargo test 下编译，不进 release。
//! 执行器（runs/executor）、抖音/企微（connections）、直发（sends）的全链路
//! 测试共用同一份读循环与 server 起停，断言所见 HTTP 形态保持一致。

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::connections::{ConnectionConfig, DispatchOutcome, HandshakeOutcome};

/// 串行/并发 server 共用的 responder：收到（序号, 请求行, body），
/// 返回（状态行, 响应体）。
pub(crate) type Responder = Arc<dyn Fn(usize, &str, &str) -> (String, String) + Send + Sync>;

/// 录制到的 POST 请求：请求行/头/body + 到达与响应时刻（串行/交错断言用）。
#[derive(Clone)]
pub(crate) struct RecordedPost {
    pub request_line: String,
    pub head: String,
    pub body: String,
    pub arrived_at: Instant,
    pub responded_at: Instant,
}

impl RecordedPost {
    /// 大小写不敏感的请求头取值。
    pub(crate) fn header(&self, name: &str) -> Option<String> {
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

/// 请求行（头的第一行，如 `POST /hook?... HTTP/1.1`）。
pub(crate) fn request_line_of(head: &str) -> String {
    head.lines().next().unwrap_or_default().to_string()
}

/// 读完整请求（请求头 + Content-Length 定长 body），返回（头, body）。
/// GET（无 body / 无 Content-Length）读到头即返回（按长度 0 收口）。
pub(crate) fn read_head_and_body(stream: &mut TcpStream) -> (String, String) {
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
                let body = String::from_utf8_lossy(&buf[split + 4..split + 4 + content_length])
                    .to_string();
                return (head, body);
            }
        }
    }
}

/// 恒 200/ok 的 responder（多数成功路径用）。
pub(crate) fn ok_responder() -> Responder {
    Arc::new(|_index, _line, _body| ("HTTP/1.1 200 OK".to_string(), "ok".to_string()))
}

/// 单连接处理骨架（serial/concurrent 两入口共用，Reuse-first 审计退件：
/// 曾逐字重复两份）：读全 → responder 决定响应 → delay → 写出 → 录制。
fn serve_connection(
    mut stream: TcpStream,
    index: usize,
    responder: &Responder,
    delay: Duration,
    tx: &Sender<RecordedPost>,
) {
    let arrived_at = Instant::now();
    let (head, body) = read_head_and_body(&mut stream);
    let request_line = request_line_of(&head);
    let (status_line, response_body) = responder(index, &request_line, &body);
    std::thread::sleep(delay);
    let response = format!(
        "{status_line}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response_body}",
        response_body.len()
    );
    stream.write_all(response.as_bytes()).unwrap();
    stream.shutdown(Shutdown::Both).unwrap();
    tx.send(RecordedPost {
        request_line,
        head,
        body,
        arrived_at,
        responded_at: Instant::now(),
    })
    .unwrap();
}

/// 串行监听：一个线程依次处理 count 个请求（accept → 读全 → delay → 响应）。
/// responder 收到 (序号, 请求行, body) 决定状态行与响应体（可捕获测试上下文）。
/// 顺序处理保证：第 k+1 个请求的 accept 发生在第 k 个响应写出之后——
/// 若执行器并行发送，arrival 顺序/时刻断言会捕获。
pub(crate) fn start_serial_server(
    count: usize,
    responder: Responder,
    delay: Duration,
) -> (SocketAddr, Receiver<RecordedPost>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let (tx, rx) = channel();
    std::thread::spawn(move || {
        for index in 0..count {
            let (stream, _) = listener.accept().unwrap();
            serve_connection(stream, index, &responder, delay, &tx);
        }
    });
    (addr, rx)
}

/// 并发监听：每个连接一线程同时处理（accept → 读全 → delay → 响应），
/// 可观测多剧本请求交错到达。请求身份靠 body 区分（index 只是 accept 序）。
pub(crate) fn start_concurrent_server(
    count: usize,
    responder: Responder,
    delay: Duration,
) -> (SocketAddr, Receiver<RecordedPost>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let (tx, rx) = channel();
    std::thread::spawn(move || {
        for index in 0..count {
            let (stream, _) = listener.accept().unwrap();
            let tx = tx.clone();
            let responder = responder.clone();
            std::thread::spawn(move || serve_connection(stream, index, &responder, delay, &tx));
        }
    });
    (addr, rx)
}

/// 单请求监听：accept → 读全 → 录制发出 → delay → responder 决定响应
/// （握手/直发的单请求成功/失败路径用）。
pub(crate) fn start_single_server(
    responder: impl Fn(&RecordedPost) -> (String, String) + Send + 'static,
    delay: Duration,
) -> (SocketAddr, Receiver<RecordedPost>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let (tx, rx) = channel();
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let (head, body) = read_head_and_body(&mut stream);
        let request = RecordedPost {
            request_line: request_line_of(&head),
            head,
            body,
            arrived_at: Instant::now(),
            responded_at: Instant::now(),
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

/// 超时可调的直连客户端（全链路测试共用同一构造）。
pub(crate) fn quick_client(timeout: Duration) -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .timeout(timeout)
        .build()
        .unwrap()
}

// ---- C4 单 Rust channel 测试台：GET 握手 query 解析 + chain 单请求录制服务 +
// ---- 握手/直发单例执行器与模板断言（各渠道 chain.rs 的五例模板收口于此） ----

/// GET 握手 query 解析（共享）：从请求行取 `path?query`（`METHOD path?query
/// HTTP/x` 三段式；裸 `a=1&b=2` 亦可直解），`&` 分段、首个 `=` 切分、无值落空串、
/// 空段跳过，键值均经 [`crate::connections::util::percent_decode`] 解码
/// （`+` 还原空格、大小写 hex 均收、坏 UTF-8 lossy）。
/// 收口既有各渠道手写变体：dingtalk `query_params`（未解码）、eleme/jingdong/
/// pinduoduo `query_param`（单参取值）、wecom/aibot/weibo/whatsapp `query_of`
/// （手写 urldecode，与本函数同语义）。
pub(crate) fn query_params(request_line: &str) -> HashMap<String, String> {
    let without_version = request_line.split(" HTTP/").next().unwrap_or(request_line);
    let path_query = without_version
        .split_whitespace()
        .last()
        .unwrap_or(without_version);
    let query = path_query
        .split_once('?')
        .map(|(_, query)| query)
        .unwrap_or_else(|| {
            if path_query.starts_with('/') {
                ""
            } else {
                path_query
            }
        });
    query
        .split('&')
        .filter(|pair| !pair.is_empty())
        .map(|pair| {
            let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
            (
                crate::connections::util::percent_decode(key),
                crate::connections::util::percent_decode(value),
            )
        })
        .collect()
}

/// 请求行 query 单参取值（eleme/jingdong/pinduoduo `query_param` 变体的共享形态；
/// 缺参落 None，由调用方按官方协议要素断言）。
pub(crate) fn query_param(request_line: &str, name: &str) -> Option<String> {
    query_params(request_line).remove(name)
}

/// chain 模板单请求录制服务（共享）：accept → 读全 → 先录制 → delay → 响应
/// （GET 握手与 POST 直发共用；GET 无 body 时读循环在头收口）。
/// 即 [`start_single_server`] 在 chain 模板下的命名入口；请求头/体访问经
/// [`RecordedPost`]（[`RecordedPost::header`] 大小写不敏感取头、`request_line`、
/// `body`），query 断言经 [`query_params`]/[`query_param`]。
/// 收口既有各渠道手写变体：telegram/weibo/whatsapp `start_request_server`
/// （+`Recorded`+取头 fn）、wecom/aibot `start_get_server`。
pub(crate) fn start_chain_server(
    responder: impl Fn(&RecordedPost) -> (String, String) + Send + 'static,
    delay: Duration,
) -> (SocketAddr, Receiver<RecordedPost>) {
    start_single_server(responder, delay)
}

/// 固定状态行 + 响应体的 responder（模板行：非 200/空 200 骨架）：替代各 chain.rs
/// 内重复的 `boom`/`ok`/`plain`/`not_found` 闭包；延迟经服务 `delay` 参数表达
/// （如超时行 `Duration::from_secs(1)` 配 200ms 客户端）。
pub(crate) fn status_responder(
    status_line: &'static str,
    body: &'static str,
) -> impl Fn(&RecordedPost) -> (String, String) + Send + 'static {
    move |_| (status_line.to_string(), body.to_string())
}

/// 握手结果模板断言：ok 旗标 + message 逐条包含。
pub(crate) fn assert_handshake(
    outcome: &HandshakeOutcome,
    expect_ok: bool,
    expect_substrs: &[&str],
) {
    assert_eq!(outcome.ok, expect_ok, "握手 ok 旗标：{outcome:?}");
    for substr in expect_substrs {
        assert!(
            outcome.message.contains(substr),
            "握手 message 应含 {substr:?}：{outcome:?}"
        );
    }
}

/// 非 200 回执模板断言：status + body 照录、error 置 None（回执事实非发送错误）。
pub(crate) fn assert_dispatch_receipt(outcome: &DispatchOutcome, status: u16, body: &str) {
    assert_eq!(outcome.status, status, "{outcome:?}");
    assert_eq!(outcome.body, body, "{outcome:?}");
    assert_eq!(
        outcome.error, None,
        "非 200 是回执事实，不是发送错误：{outcome:?}"
    );
}

/// 超时/未发出模板断言：status 0 + error 逐条包含 + 空回执。
pub(crate) fn assert_dispatch_error(outcome: &DispatchOutcome, expect_substrs: &[&str]) {
    assert_eq!(outcome.status, 0, "未收到响应时 status 为 0：{outcome:?}");
    let error = outcome.error.clone().expect("应有错误原因");
    for substr in expect_substrs {
        assert!(error.contains(substr), "error 应含 {substr:?}：{error:?}");
    }
    assert_eq!(outcome.body, "", "{outcome:?}");
}

/// 直发协议要素快照期望（小结构）：调用方供期望值，一处断言 msg_id|signature|
/// timestamp（如快照取自请求侧复算值，方向由调用方决定）。
pub(crate) struct ExpectedSnapshots<'a> {
    pub msg_id: &'a str,
    pub signature: &'a str,
    pub timestamp: Option<&'a str>,
}

/// 直发协议要素快照模板断言。
pub(crate) fn assert_snapshots(outcome: &DispatchOutcome, expected: ExpectedSnapshots<'_>) {
    assert_eq!(outcome.msg_id, expected.msg_id, "{outcome:?}");
    assert_eq!(outcome.signature, expected.signature, "{outcome:?}");
    assert_eq!(
        outcome.timestamp.as_deref(),
        expected.timestamp,
        "{outcome:?}"
    );
}

/// 握手单例执行器（chain 模板：起录制服务 → 握手 → 模板断言 → 交回录制请求作
/// 通道 bespoke 断言）。wrong-config 拒绝（无网络）不在此列，保留两行直断。
pub(crate) fn run_handshake_case(
    responder: impl Fn(&RecordedPost) -> (String, String) + Send + 'static,
    delay: Duration,
    client_timeout: Duration,
    make_config: impl FnOnce(SocketAddr) -> ConnectionConfig,
    verify: fn(&reqwest::blocking::Client, &ConnectionConfig) -> HandshakeOutcome,
    expect_ok: bool,
    expect_substrs: &[&str],
) -> (HandshakeOutcome, RecordedPost) {
    let (addr, rx) = start_chain_server(responder, delay);
    let config = make_config(addr);
    let outcome = verify(&quick_client(client_timeout), &config);
    assert_handshake(&outcome, expect_ok, expect_substrs);
    let request = rx
        .recv_timeout(Duration::from_secs(2))
        .expect("应收到一次握手请求");
    (outcome, request)
}

/// 直发单例执行器（chain 模板：起录制服务 → 直发 → 交回结果与录制请求；
/// 回执/快照断言由调用方经 `assert_*` 作通道 bespoke 断言）。
pub(crate) fn run_dispatch_case(
    responder: impl Fn(&RecordedPost) -> (String, String) + Send + 'static,
    plaintext: &str,
    delay: Duration,
    client_timeout: Duration,
    make_config: impl FnOnce(SocketAddr) -> ConnectionConfig,
    dispatch: fn(&reqwest::blocking::Client, &ConnectionConfig, &str) -> DispatchOutcome,
) -> (DispatchOutcome, RecordedPost) {
    let (addr, rx) = start_chain_server(responder, delay);
    let config = make_config(addr);
    let outcome = dispatch(&quick_client(client_timeout), &config, plaintext);
    let request = rx
        .recv_timeout(Duration::from_secs(2))
        .expect("应收到一次直发请求");
    (outcome, request)
}

// ---- 测试台自带逻辑的单元覆盖（query 解析边角；执行器经各渠道套件实证） ----

#[test]
fn query_params_parses_request_line_table() {
    let cases: &[(&str, &[(&str, &str)])] = &[
        // 标准三段式（dingtalk/wecom 形态）
        (
            "POST /callback?signature=abc&timestamp=1663143335567&nonce=w2WPvWxxxxGOmIB HTTP/1.1",
            &[
                ("signature", "abc"),
                ("timestamp", "1663143335567"),
                ("nonce", "w2WPvWxxxxGOmIB"),
            ],
        ),
        (
            "GET /webhooks/wecom?msg_signature=s&timestamp=1&nonce=n&echostr=e HTTP/1.1",
            &[
                ("msg_signature", "s"),
                ("timestamp", "1"),
                ("nonce", "n"),
                ("echostr", "e"),
            ],
        ),
        // 点分键（whatsapp hub 三参）
        (
            "GET /hook?hub.mode=subscribe&hub.challenge=1234567890123456&hub.verify_token=t HTTP/1.1",
            &[
                ("hub.mode", "subscribe"),
                ("hub.challenge", "1234567890123456"),
                ("hub.verify_token", "t"),
            ],
        ),
        // 无 query 落空集
        ("POST /hook HTTP/1.1", &[]),
        // 裸 query 直解（无 METHOD/版本）
        ("a=1&b=2", &[("a", "1"), ("b", "2")]),
        // 百分号解码：%2B 还原 +（echostr 尾部 == 同理首个 = 切分）、无值落空串、
        // 空段跳过
        (
            "POST /cb?echostr=ab%2Bcd%3D%3D&flag&&empty= HTTP/1.1",
            &[("echostr", "ab+cd=="), ("flag", ""), ("empty", "")],
        ),
        // form 惯例 + 还原空格、UTF-8 字节还原
        (
            "POST /cb?msg=%E4%B8%AD%E6%96%87&plus=a+b HTTP/1.1",
            &[("msg", "中文"), ("plus", "a b")],
        ),
    ];
    for (line, expected) in cases {
        let params = query_params(line);
        assert_eq!(params.len(), expected.len(), "行：{line}");
        for (key, value) in *expected {
            assert_eq!(
                params.get(*key).map(String::as_str),
                Some(*value),
                "行：{line} 键：{key}"
            );
        }
    }
}

#[test]
fn query_param_getter_returns_decoded_single_value() {
    let line = "POST /cb?sig=abc&timestamp=123 HTTP/1.1";
    assert_eq!(query_param(line, "sig").as_deref(), Some("abc"));
    assert_eq!(query_param(line, "missing"), None);
    assert_eq!(
        query_param("GET /hub?hub.mode=subscribe HTTP/1.1", "hub.mode").as_deref(),
        Some("subscribe")
    );
}
