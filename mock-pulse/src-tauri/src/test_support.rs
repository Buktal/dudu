//! 测试基建共享单点：本地 TcpListener 起停 + 请求录制 + 超时客户端。
//! 经 lib.rs 以 `#[cfg(test)]` 挂载，只在 cargo test 下编译，不进 release。
//! 执行器（runs/executor）、抖音/企微（connections）、直发（sends）的全链路
//! 测试共用同一份读循环与 server 起停，断言所见 HTTP 形态保持一致。

use std::io::{Read, Write};
use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
use std::sync::Arc;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::time::{Duration, Instant};

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
