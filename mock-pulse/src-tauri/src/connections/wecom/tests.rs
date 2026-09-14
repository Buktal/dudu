//! 企微协议全链路测试：echostr 握手（成功/带引号/非 200/超时）与直发
//! （加密信封逐字节/三种回执形态/非 200/超时/配置判别）。
//! 网络基建在 crate::test_support（共享）；黄金例常量在 crypto（单点）。

use std::collections::HashMap;
use std::io::Write;
use std::net::{Shutdown, SocketAddr, TcpListener};
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;

use super::crypto::{GOLDEN_CORP_ID, GOLDEN_ENCODING_AES_KEY, GOLDEN_TOKEN};
use crate::connections::ConnectionConfig;
use crate::test_support::{quick_client, read_head_and_body, start_single_server, RecordedPost};

use super::*;

fn wecom_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Wecom {
        url,
        corp_id: GOLDEN_CORP_ID.into(),
        token: GOLDEN_TOKEN.into(),
        encoding_aes_key: GOLDEN_ENCODING_AES_KEY.into(),
        agent_id: "218".into(),
    }
}

// ---- echostr 握手全链路：本地 TcpListener 演示成功/失败路径 ----

/// 表单风格 urldecode（官方握手第①步「参数值 urldecode」）。
fn urldecode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' if i + 2 < bytes.len() => {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
                if let Ok(byte) = u8::from_str_radix(hex, 16) {
                    out.push(byte);
                    i += 3;
                    continue;
                }
                out.push(b'%');
            }
            byte => out.push(byte),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn query_of(request_line: &str) -> HashMap<String, String> {
    let url = request_line.split_whitespace().nth(1).unwrap_or_default();
    let query = url.split_once('?').map(|(_, q)| q).unwrap_or_default();
    query
        .split('&')
        .filter(|kv| !kv.is_empty())
        .map(|kv| {
            let (key, value) = kv.split_once('=').unwrap_or((kv, ""));
            (urldecode(key), urldecode(value))
        })
        .collect()
}

/// 起一个只处理一次 GET 的本地监听；responder 决定状态行与响应体。
fn start_get_server(
    responder: fn(&str, &HashMap<String, String>) -> (String, String),
    delay: Duration,
) -> (SocketAddr, Receiver<(String, HashMap<String, String>)>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let (tx, rx) = channel();
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        // GET 无 body：读循环在头收口（Content-Length 缺省按 0）
        let (head, _body) = read_head_and_body(&mut stream);
        let request_line = head.lines().next().unwrap_or_default().to_string();
        let query = query_of(&request_line);
        tx.send((request_line.clone(), query.clone())).unwrap();
        std::thread::sleep(delay);
        let (status_line, body) = responder(&request_line, &query);
        let response = format!(
            "{status_line}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        stream.write_all(response.as_bytes()).unwrap();
        stream.shutdown(Shutdown::Both).unwrap();
    });
    (addr, rx)
}

/// 忠实实现官方四步：① urldecode（query_of 已做）② 重算签名比对
/// ③ 解密 echostr 取 msg ④ 回显明文（无引号/无换行）。
fn wecom_echo_ok(_request_line: &str, query: &HashMap<String, String>) -> (String, String) {
    let echostr = &query["echostr"];
    let expect_sig =
        build_signature(GOLDEN_TOKEN, &query["timestamp"], &query["nonce"], echostr);
    assert_eq!(expect_sig, query["msg_signature"], "签名应可复算");
    let decrypted = decrypt_msg(GOLDEN_ENCODING_AES_KEY, echostr).unwrap();
    assert_eq!(decrypted.receiveid, GOLDEN_CORP_ID, "receiveid 应为 corpid");
    (
        "HTTP/1.1 200 OK".into(),
        String::from_utf8(decrypted.msg).unwrap(),
    )
}

#[test]
fn handshake_succeeds_when_plaintext_echoed() {
    let (addr, rx) = start_get_server(wecom_echo_ok, Duration::ZERO);
    let config = wecom_config(format!("http://{addr}/webhooks/wecom"));
    let outcome = verify_handshake(&quick_client(Duration::from_secs(2)), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("回显"), "{outcome:?}");

    // 请求侧逐项核对官方协议要素
    let (request_line, query) = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert!(
        request_line.starts_with("GET /webhooks/wecom"),
        "{request_line}"
    );
    for key in ["msg_signature", "timestamp", "nonce", "echostr"] {
        assert!(query.contains_key(key), "缺少 {key} 参数：{query:?}");
    }
    // echostr 可解出非空随机明文，receiveid 为 corpid
    let decrypted = decrypt_msg(GOLDEN_ENCODING_AES_KEY, &query["echostr"]).unwrap();
    assert!(!decrypted.msg.is_empty());
    assert_eq!(decrypted.receiveid, GOLDEN_CORP_ID);
    // 签名 = sha1(四值字典序拼接)，与请求里的 msg_signature 一致
    assert_eq!(
        query["msg_signature"],
        build_signature(
            GOLDEN_TOKEN,
            &query["timestamp"],
            &query["nonce"],
            &query["echostr"]
        )
    );
}

#[test]
fn handshake_fails_when_echo_wrapped_in_quotes() {
    // 官方明确「不能加引号」——回显带引号即逐字节不一致
    let quoted: fn(&str, &HashMap<String, String>) -> (String, String) =
        |_request_line, query| {
            let decrypted = decrypt_msg(GOLDEN_ENCODING_AES_KEY, &query["echostr"]).unwrap();
            (
                "HTTP/1.1 200 OK".into(),
                format!("\"{}\"", String::from_utf8(decrypted.msg).unwrap()),
            )
        };
    let (addr, _rx) = start_get_server(quoted, Duration::ZERO);
    let config = wecom_config(format!("http://{addr}/hook"));
    let outcome = verify_handshake(&quick_client(Duration::from_secs(2)), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("不一致"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_non_200() {
    let responder: fn(&str, &HashMap<String, String>) -> (String, String) =
        |_, _| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
    let (addr, _rx) = start_get_server(responder, Duration::ZERO);
    let config = wecom_config(format!("http://{addr}/hook"));
    let outcome = verify_handshake(&quick_client(Duration::from_secs(2)), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("500"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_timeout() {
    // 官方要求 1 秒内响应；客户端 200ms 超时 vs 服务器 1s 延迟
    let (addr, _rx) = start_get_server(wecom_echo_ok, Duration::from_secs(1));
    let config = wecom_config(format!("http://{addr}/hook"));
    let outcome = verify_handshake(&quick_client(Duration::from_millis(200)), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("超时"), "{outcome:?}");
}

// ---- 直发全链路：本地 TcpListener 覆盖加密信封 / 三种回执形态 / 非 200 / 超时 ----

/// 测试侧独立提取信封密文（朴素扫描，不复用生产实现，避免同函数自证）。
fn naive_extract_encrypt(envelope: &str) -> &str {
    let open = "<Encrypt><![CDATA[";
    let start = envelope.find(open).expect("信封应含 Encrypt 元素") + open.len();
    let end = start
        + envelope[start..]
            .find("]]>")
            .expect("Encrypt 应有 CDATA 闭合");
    &envelope[start..end]
}

/// 官方被动回复明文（§5.8 逐字：方向反转，ToUserName=成员、FromUserName=CorpID）。
const REPLY_PLAINTEXT: &str = concat!(
    "<xml>\n",
    "   <ToUserName><![CDATA[fromUser]]></ToUserName>\n",
    "   <FromUserName><![CDATA[wx5823bf96d3bd56c7]]></FromUserName> \n",
    "   <CreateTime>1348831860</CreateTime>\n",
    "   <MsgType><![CDATA[text]]></MsgType>\n",
    "   <Content><![CDATA[this is a test]]></Content>\n",
    "</xml>",
);

/// 目标按官方 §3.5 构造加密被动回复包（固定随机数，便于逐字断言）。
fn passive_reply_envelope() -> String {
    let encrypt = encrypt_msg(
        GOLDEN_ENCODING_AES_KEY,
        &[3u8; 16],
        REPLY_PLAINTEXT.as_bytes(),
        GOLDEN_CORP_ID,
    )
    .unwrap();
    let signature = build_signature(GOLDEN_TOKEN, "1409659813", "1372623149", &encrypt);
    format!(
        "<xml>\n   <Encrypt><![CDATA[{encrypt}]]></Encrypt>\n   <MsgSignature><![CDATA[{signature}]]></MsgSignature>\n   <TimeStamp>1409659813</TimeStamp>\n   <Nonce><![CDATA[1372623149]]></Nonce>\n</xml>"
    )
}

#[test]
fn dispatch_delivers_envelope_independently_decryptable_verbatim() {
    let empty_receipt: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 200 OK".into(), String::new());
    let (addr, rx) = start_single_server(empty_receipt, Duration::ZERO);
    let config = wecom_config(format!("http://{addr}/hook"));
    // 前端确定性拼装的明文 XML（含非 ASCII，验证 UTF-8 字节透传）
    let plaintext = "<xml>\n   <ToUserName><![CDATA[wx5823bf96d3bd56c7]]></ToUserName>\n   <MsgType><![CDATA[text]]></MsgType>\n   <Content><![CDATA[你好，企业微信]]></Content>\n</xml>";

    let outcome = dispatch_event(&quick_client(Duration::from_secs(2)), &config, plaintext);

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.body, "");
    assert_eq!(outcome.reply, None);
    assert_eq!(outcome.error, None);

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    // 请求行：POST + msg_signature/timestamp/nonce 查询参数
    assert!(
        request.request_line.starts_with("POST /hook?"),
        "{}",
        request.request_line
    );
    let query = query_of(&request.request_line);
    for key in ["msg_signature", "timestamp", "nonce"] {
        assert!(query.contains_key(key), "缺少 {key} 参数：{query:?}");
    }
    assert_eq!(request.header("Content-Type").as_deref(), Some("text/xml"));
    // 信封结构：官方 §5.1 元素序 ToUserName→Encrypt→AgentID
    let ciphertext = naive_extract_encrypt(&request.body);
    let expected_envelope = format!(
        "<xml><ToUserName><![CDATA[{GOLDEN_CORP_ID}]]></ToUserName><Encrypt><![CDATA[{ciphertext}]]></Encrypt><AgentID><![CDATA[218]]></AgentID></xml>"
    );
    assert_eq!(request.body, expected_envelope, "信封应逐字节等于官方形态");
    // 独立解密回原明文（decrypt_msg 已由官方黄金密文独立验证）
    let decrypted = decrypt_msg(GOLDEN_ENCODING_AES_KEY, ciphertext).unwrap();
    assert_eq!(decrypted.msg, plaintext.as_bytes());
    assert_eq!(decrypted.receiveid, GOLDEN_CORP_ID);
    // msg_signature = sha1(token/timestamp/nonce/密文 四值字典序)，与快照一致
    assert_eq!(
        query["msg_signature"],
        build_signature(
            GOLDEN_TOKEN,
            &query["timestamp"],
            &query["nonce"],
            ciphertext
        )
    );
    assert_eq!(outcome.signature, query["msg_signature"]);
    assert_eq!(outcome.timestamp.as_deref(), Some(query["timestamp"].as_str()));
    // 企微的发送唯一标识 = nonce（统一结果的 msg_id 快照）
    assert_eq!(outcome.msg_id, query["nonce"]);
}

#[test]
fn dispatch_returns_success_receipt_verbatim() {
    let success: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 200 OK".into(), "success".into());
    let (addr, _rx) = start_single_server(success, Duration::ZERO);
    let config = wecom_config(format!("http://{addr}/hook"));

    let outcome = dispatch_event(
        &quick_client(Duration::from_secs(2)),
        &config,
        "<xml><MsgType><![CDATA[event]]></MsgType></xml>",
    );

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.body, "success");
    assert_eq!(outcome.reply, None);
    assert_eq!(outcome.error, None);
}

#[test]
fn dispatch_decrypts_encrypted_passive_reply_into_record() {
    let reply: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 200 OK".into(), passive_reply_envelope());
    let (addr, _rx) = start_single_server(reply, Duration::ZERO);
    let config = wecom_config(format!("http://{addr}/hook"));

    let outcome = dispatch_event(
        &quick_client(Duration::from_secs(2)),
        &config,
        "<xml><MsgType><![CDATA[text]]></MsgType></xml>",
    );

    // 原始回执原样保留；解密明文一并返回（入运行记录）
    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.body, passive_reply_envelope());
    assert_eq!(outcome.reply, Some(REPLY_PLAINTEXT.to_string()));
    assert_eq!(outcome.error, None);
}

#[test]
fn dispatch_reports_non_200_status_and_body() {
    let boom: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
    let (addr, _rx) = start_single_server(boom, Duration::ZERO);
    let config = wecom_config(format!("http://{addr}/hook"));

    let outcome = dispatch_event(
        &quick_client(Duration::from_secs(2)),
        &config,
        "<xml></xml>",
    );

    assert_eq!(outcome.status, 500);
    assert_eq!(outcome.body, "boom");
    assert_eq!(outcome.reply, None);
    assert_eq!(outcome.error, None, "非 200 是回执事实，不是发送错误");
}

#[test]
fn dispatch_reports_timeout_without_response() {
    let slow: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 200 OK".into(), "success".into());
    let (addr, _rx) = start_single_server(slow, Duration::from_secs(1));
    let config = wecom_config(format!("http://{addr}/hook"));

    let outcome = dispatch_event(
        &quick_client(Duration::from_millis(200)),
        &config,
        "<xml></xml>",
    );

    assert_eq!(outcome.status, 0, "未收到响应时 status 为 0");
    let error = outcome.error.clone().expect("应有错误原因");
    assert!(error.contains("超时"), "{outcome:?}");
    assert_eq!(outcome.body, "");
    assert_eq!(outcome.reply, None);
}

#[test]
fn dispatch_rejects_non_wecom_config() {
    let config = ConnectionConfig::Douyin {
        url: "http://127.0.0.1:1/hook".into(),
        system: crate::connections::DouyinSystem::Dop,
        client_key: "tt_key".into(),
        client_secret: "tt_secret".into(),
        mini_game_token: String::new(),
        isv_token: String::new(),
        isv_key: String::new(),
    };
    let outcome = dispatch_event(&quick_client(Duration::from_secs(2)), &config, "<xml/>");
    assert_eq!(outcome.status, 0);
    assert!(outcome.error.unwrap().contains("不是企业微信渠道"));
}
