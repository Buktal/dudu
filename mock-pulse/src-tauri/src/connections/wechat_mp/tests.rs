//! 公众号协议全链路测试：官方三组数值例（encryption.html debug_demo，事实库
//! §4.2/§4.3/§4.4/§5.14 记录的参数与签名值；Encrypt 全串取自同一官方页面）、
//! GET 三参握手（成功/带引号/非 200/超时）与三模式直发（明文逐字节/兼容并存/
//! 安全信封独立可解/三种回执形态/非 200/超时）。
//! 协议原语经本渠道 Adapter 直调（收窄签名，配置判别由注册表路由保证）；
//! 网络基建在 crate::test_support（共享）；AES 原语复用 wecom::crypto。

use std::collections::HashMap;
use std::io::Write;
use std::net::{Shutdown, SocketAddr, TcpListener};
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;

use crate::connections::util::percent_decode;
use crate::connections::ChannelAdapter;
use crate::connections::{ConnectionConfig, WechatMpMode};
use crate::test_support::{quick_client, read_head_and_body, start_single_server, RecordedPost};

use super::super::wechat_common::build_msg_signature;
use super::super::wecom::crypto::{decrypt_msg, encrypt_msg};
use super::*;

// ---- 官方数值例常量（encryption.html debug_demo；事实库 §4.2–§4.4/§5.14） ----

/// 服务器配置三元组示例值（事实库 §4.2/§4.3：token=AAAAA；AESKey 43 个 A）。
const GOLDEN_TOKEN: &str = "AAAAA";
const GOLDEN_ENCODING_AES_KEY: &str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const GOLDEN_APP_ID: &str = "wxba5fad812f8e6fb9";

/// 数值例一（明文三参签名，事实库 §4.2）：token=AAAAA、timestamp=1714037059、
/// nonce=486452656 → 排序拼接 1714037059486452656AAAAA → sha1。
const GOLDEN_PLAIN_SIGNATURE: &str = "899cf89e464efb63f54ddac96b0a0a235f53aa78";
const GOLDEN_PLAIN_TIMESTAMP: &str = "1714037059";
const GOLDEN_PLAIN_NONCE: &str = "486452656";

/// 数值例二（安全模式收包，事实库 §4.3/§5.14）：Encrypt 224 字节密文
/// （官方页全串 300 位 Base64，事实库节选自「+qdx1OKCy…」至「…Gj04=」）、
/// timestamp=1714112445、nonce=415670741 → msg_signature=046e02f8…。
const GOLDEN_PUSH_ENCRYPT: &str = concat!(
    "+qdx1OKCy+5JPCBFWw70tm0fJGb2Jmeia4FCB7kao+/Q5c/ohsOzQHi8khUOb05JCpj0JB4RvQMkUyus8TPxLKJGQqcvZqzDpVza",
    "zhZv6JsXUnnR8XGT740XgXZUXQ7vJVnAG+tE8NUd4yFyjPy7GgiaviNrlCTj+l5kdfMuFUPpRSrfMZuMcp3Fn2Pede2IuQrKEYwK",
    "SqFIZoNqJ4M8EajAsjLY2km32IIjdf8YL/P50F7mStwntrA2cPDrM1kb6mOcfBgRtWygb3VIYnSeOBrebufAlr7F9mFUPAJGj04=",
);
const GOLDEN_PUSH_MSG_SIGNATURE: &str = "046e02f8204d34f8ba5fa3b1db94908f3df2e9b3";
const GOLDEN_PUSH_TIMESTAMP: &str = "1714112445";
const GOLDEN_PUSH_NONCE: &str = "415670741";

/// 数值例二解密明文（事实库 §4.4：random=a8eedb185eb2fecf、msg_len=167、
/// 尾部 appid 须校验；官方页给出完整 JSON，167 字节）。
const GOLDEN_PUSH_PLAINTEXT: &str = concat!(
    r#"{"ToUserName":"gh_97417a04a28d","#,
    r#""FromUserName":"o9AgO5Kd5ggOC-bXrbNODIiE3bGY","#,
    r#""CreateTime":1714112445,"MsgType":"event","#,
    r#""Event":"debug_demo","debug_str":"hello world"}"#,
);

/// 数值例三（加密回包，事实库 §4.4/§5.14）：random=707722b803182950、
/// msg_len=25、FullStr 63B → 密文 64B → Encrypt（官方页全串）；回包签名
/// TimeStamp=1713424427、Nonce=415670741 → 1b933996…。
const GOLDEN_REPLY_ENCRYPT: &str =
    "ELGduP2YcVatjqIS+eZbp80MNLoAUWvzzyJxgGzxZO/5sAvd070Bs6qrLARC9nVHm48Y4hyRbtzve1L32tmxSQ==";
const GOLDEN_REPLY_SIGNATURE: &str = "1b9339964ed2e271e7c7b6ff2b0ef902fc94dea1";
const GOLDEN_REPLY_TIMESTAMP: &str = "1713424427";
const GOLDEN_REPLY_NONCE: &str = "415670741";
const GOLDEN_REPLY_PLAINTEXT: &str = r#"{"demo_resp":"good luck"}"#;
const GOLDEN_REPLY_RANDOM: &[u8; 16] = b"707722b803182950";

#[test]
fn golden_three_param_signature_recomputes_official_value() {
    // 数值例一：token/timestamp/nonce 字典序排序拼接后 sha1（GET 握手签名）
    assert_eq!(GOLDEN_PLAIN_SIGNATURE.len(), 40);
    let signature =
        build_callback_signature(GOLDEN_TOKEN, GOLDEN_PLAIN_TIMESTAMP, GOLDEN_PLAIN_NONCE);
    assert_eq!(signature, GOLDEN_PLAIN_SIGNATURE);
}

#[test]
fn golden_push_ciphertext_decrypts_to_official_demo_json() {
    // 数值例二：官方密文 → AES 解密 → 明文为 167 字节 demo JSON、尾部 AppId
    // 与自身相符（事实库 §4.4「appid 须校验」）。
    let decrypted = decrypt_msg(GOLDEN_ENCODING_AES_KEY, GOLDEN_PUSH_ENCRYPT).unwrap();
    assert_eq!(decrypted.msg.len(), 167);
    assert_eq!(decrypted.msg, GOLDEN_PUSH_PLAINTEXT.as_bytes());
    assert_eq!(decrypted.receiveid, GOLDEN_APP_ID);

    // 同例四参 msg_signature：sha1(排序(token, timestamp, nonce, Encrypt))
    let signature = build_msg_signature(
        GOLDEN_TOKEN,
        GOLDEN_PUSH_TIMESTAMP,
        GOLDEN_PUSH_NONCE,
        GOLDEN_PUSH_ENCRYPT,
    );
    assert_eq!(signature, GOLDEN_PUSH_MSG_SIGNATURE);
}

#[test]
fn golden_reply_example_reencrypts_to_official_ciphertext_and_signature() {
    // 数值例三：官方 random/msg/appid 逐字节重加密 → 官方 Encrypt 密文
    // （覆盖 IV=key 前 16B、PKCS#7-32、Base64 全链路），回包签名同例复算。
    let encrypt = encrypt_msg(
        GOLDEN_ENCODING_AES_KEY,
        GOLDEN_REPLY_RANDOM,
        GOLDEN_REPLY_PLAINTEXT.as_bytes(),
        GOLDEN_APP_ID,
    )
    .unwrap();
    assert_eq!(encrypt, GOLDEN_REPLY_ENCRYPT);

    let signature = build_msg_signature(
        GOLDEN_TOKEN,
        GOLDEN_REPLY_TIMESTAMP,
        GOLDEN_REPLY_NONCE,
        &encrypt,
    );
    assert_eq!(signature, GOLDEN_REPLY_SIGNATURE);
}

// ---- 配置与网络基建 ----

fn mp_config(url: String) -> ConnectionConfig {
    mp_config_with_mode(url, WechatMpMode::default())
}

fn mp_config_with_mode(url: String, mode: WechatMpMode) -> ConnectionConfig {
    ConnectionConfig::WechatMp {
        url,
        app_id: GOLDEN_APP_ID.into(),
        token: GOLDEN_TOKEN.into(),
        encoding_aes_key: GOLDEN_ENCODING_AES_KEY.into(),
        mode,
    }
}

fn query_of(request_line: &str) -> HashMap<String, String> {
    let url = request_line.split_whitespace().nth(1).unwrap_or_default();
    let query = url.split_once('?').map(|(_, q)| q).unwrap_or_default();
    query
        .split('&')
        .filter(|kv| !kv.is_empty())
        .map(|kv| {
            let (key, value) = kv.split_once('=').unwrap_or((kv, ""));
            (percent_decode(key), percent_decode(value))
        })
        .collect()
}

/// 起一个只处理一次 GET 的本地监听；responder 决定状态行与响应体。
fn start_get_server(
    responder: fn(&HashMap<String, String>) -> (String, String),
    delay: Duration,
) -> (SocketAddr, Receiver<HashMap<String, String>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = listener.local_addr().unwrap();
    let (tx, rx) = channel();
    std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        let (head, _body) = read_head_and_body(&mut stream);
        let request_line = head.lines().next().unwrap_or_default().to_string();
        let query = query_of(&request_line);
        tx.send(query.clone()).unwrap();
        std::thread::sleep(delay);
        let (status_line, body) = responder(&query);
        let response = format!(
            "{status_line}\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        stream.write_all(response.as_bytes()).unwrap();
        stream.shutdown(Shutdown::Both).unwrap();
    });
    (addr, rx)
}

// ---- GET 三参握手全链路 ----

/// 忠实实现官方三步：① 参数已 urldecode ② 重算三参签名比对 ③ 原样回 echostr。
fn echo_ok(query: &HashMap<String, String>) -> (String, String) {
    let expect_sig = build_callback_signature(GOLDEN_TOKEN, &query["timestamp"], &query["nonce"]);
    assert_eq!(expect_sig, query["signature"], "三参签名应可复算");
    ("HTTP/1.1 200 OK".into(), query["echostr"].clone())
}

#[test]
fn handshake_succeeds_when_echostr_echoed_verbatim() {
    let (addr, rx) = start_get_server(echo_ok, Duration::ZERO);
    let config = mp_config(format!("http://{addr}/webhooks/wechat-mp"));
    let outcome = Adapter.verify_handshake(&quick_client(Duration::from_secs(2)), &config);

    assert!(outcome.ok, "应成功：{outcome:?}");
    assert!(outcome.message.contains("原样回显"), "{outcome:?}");

    // 请求侧逐项核对官方协议要素（事实库 §3.2 四参数 GET）
    let query = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    for key in ["signature", "timestamp", "nonce", "echostr"] {
        assert!(query.contains_key(key), "缺少 {key} 参数：{query:?}");
    }
    assert_eq!(query["echostr"].len(), 32, "echostr 为随机 hex 明文");
    assert_eq!(
        query["signature"],
        build_callback_signature(GOLDEN_TOKEN, &query["timestamp"], &query["nonce"])
    );
}

#[test]
fn handshake_fails_when_echo_wrapped_in_quotes() {
    // 官方明确「原样返回 echostr，不能加引号」
    let quoted: fn(&HashMap<String, String>) -> (String, String) = |query| {
        (
            "HTTP/1.1 200 OK".into(),
            format!("\"{}\"", query["echostr"].clone()),
        )
    };
    let (addr, _rx) = start_get_server(quoted, Duration::ZERO);
    let config = mp_config(format!("http://{addr}/hook"));
    let outcome = Adapter.verify_handshake(&quick_client(Duration::from_secs(2)), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("不一致"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_non_200() {
    let responder: fn(&HashMap<String, String>) -> (String, String) =
        |_| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
    let (addr, _rx) = start_get_server(responder, Duration::ZERO);
    let config = mp_config(format!("http://{addr}/hook"));
    let outcome = Adapter.verify_handshake(&quick_client(Duration::from_secs(2)), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("500"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_timeout() {
    // 官方 5 秒应答窗口；客户端 200ms 超时 vs 服务器 1s 延迟
    let (addr, _rx) = start_get_server(echo_ok, Duration::from_secs(1));
    let config = mp_config(format!("http://{addr}/hook"));
    let outcome = Adapter.verify_handshake(&quick_client(Duration::from_millis(200)), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("超时"), "{outcome:?}");
}

// ---- 三模式直发全链路 ----

/// 前端确定性拼装的明文 XML（§5.1 官方黄金样本，含非 ASCII 验证 UTF-8 透传）。
const SAMPLE_PLAINTEXT: &str = concat!(
    "<xml>\n",
    " <ToUserName><![CDATA[toUser]]></ToUserName>\n",
    " <FromUserName><![CDATA[fromUser]]></FromUserName>\n",
    " <CreateTime>1348831860</CreateTime>\n",
    " <MsgType><![CDATA[text]]></MsgType>\n",
    " <Content><![CDATA[你好，公众号]]></Content>\n",
    " <MsgId>1234567890123456</MsgId>\n",
    " <MsgDataId>xxxx</MsgDataId>\n",
    " <Idx>xxxx</Idx>\n",
    "</xml>",
);

/// 测试侧独立提取信封密文（朴素扫描，不复用生产实现，避免同函数自证）。
fn naive_extract_encrypt(envelope: &str) -> &str {
    let open = "<Encrypt><![CDATA[";
    let start = envelope.find(open).expect("应含 Encrypt 元素") + open.len();
    let end = start
        + envelope[start..]
            .find("]]>")
            .expect("Encrypt 应有 CDATA 闭合");
    &envelope[start..end]
}

#[test]
fn plain_mode_posts_plaintext_verbatim_with_three_param_signature() {
    let success: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 200 OK".into(), "success".into());
    let (addr, rx) = start_single_server(success, Duration::ZERO);
    let config = mp_config_with_mode(format!("http://{addr}/hook"), WechatMpMode::Plain);

    let outcome = Adapter.dispatch_event(
        &quick_client(Duration::from_secs(2)),
        &config,
        SAMPLE_PLAINTEXT,
    );

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.body, "success");
    assert_eq!(outcome.reply, None);
    assert_eq!(outcome.error, None);

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert!(request.request_line.starts_with("POST /hook?"));
    let query = query_of(&request.request_line);
    for key in ["signature", "timestamp", "nonce", "openid"] {
        assert!(query.contains_key(key), "缺少 {key} 参数：{query:?}");
    }
    assert!(!query.contains_key("encrypt_type"), "明文模式无加密参数");
    assert!(!query.contains_key("msg_signature"), "明文模式无四参签名");
    // 明文逐字节直发（ADR-0001），Content-Type text/xml
    assert_eq!(request.body, SAMPLE_PLAINTEXT);
    assert_eq!(request.header("Content-Type").as_deref(), Some("text/xml"));
    // 三参签名与快照一致
    assert_eq!(
        query["signature"],
        build_callback_signature(GOLDEN_TOKEN, &query["timestamp"], &query["nonce"])
    );
    assert_eq!(outcome.signature, query["signature"]);
    assert_eq!(outcome.msg_id, query["nonce"]);
}

#[test]
fn secure_mode_posts_envelope_independently_decryptable_verbatim() {
    let empty_receipt: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 200 OK".into(), String::new());
    let (addr, rx) = start_single_server(empty_receipt, Duration::ZERO);
    let config = mp_config_with_mode(format!("http://{addr}/hook"), WechatMpMode::Secure);

    let outcome = Adapter.dispatch_event(
        &quick_client(Duration::from_secs(2)),
        &config,
        SAMPLE_PLAINTEXT,
    );

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.body, "");
    assert_eq!(outcome.reply, None);
    assert_eq!(outcome.error, None);

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    let query = query_of(&request.request_line);
    for key in [
        "signature",
        "timestamp",
        "nonce",
        "openid",
        "encrypt_type",
        "msg_signature",
    ] {
        assert!(query.contains_key(key), "缺少 {key} 参数：{query:?}");
    }
    assert_eq!(query["encrypt_type"], "aes");
    assert_eq!(request.header("Content-Type").as_deref(), Some("text/xml"));
    // 信封仅两字段：ToUserName=AppID + Encrypt（官方 §3.3/§5.14）
    let ciphertext = naive_extract_encrypt(&request.body);
    let expected_envelope = format!(
        "<xml><ToUserName><![CDATA[{GOLDEN_APP_ID}]]></ToUserName><Encrypt><![CDATA[{ciphertext}]]></Encrypt></xml>"
    );
    assert_eq!(request.body, expected_envelope, "信封应逐字节等于官方形态");
    // 独立解密回原明文，尾部 AppId 须与配置相符
    let decrypted = decrypt_msg(GOLDEN_ENCODING_AES_KEY, ciphertext).unwrap();
    assert_eq!(decrypted.msg, SAMPLE_PLAINTEXT.as_bytes());
    assert_eq!(decrypted.receiveid, GOLDEN_APP_ID);
    // 四参 msg_signature 与快照一致
    assert_eq!(
        query["msg_signature"],
        build_msg_signature(
            GOLDEN_TOKEN,
            &query["timestamp"],
            &query["nonce"],
            ciphertext
        )
    );
    assert_eq!(outcome.signature, query["msg_signature"]);
    assert_eq!(outcome.msg_id, query["nonce"]);
}

#[test]
fn compatible_mode_keeps_plaintext_and_appends_encrypt() {
    let empty_receipt: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 200 OK".into(), String::new());
    let (addr, rx) = start_single_server(empty_receipt, Duration::ZERO);
    let config = mp_config_with_mode(format!("http://{addr}/hook"), WechatMpMode::Compatible);

    let outcome = Adapter.dispatch_event(
        &quick_client(Duration::from_secs(2)),
        &config,
        SAMPLE_PLAINTEXT,
    );

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.error, None);

    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    let query = query_of(&request.request_line);
    assert_eq!(query["encrypt_type"], "aes");
    // 明文与密文并存：明文逐字节保留、Encrypt 殿后（事实库 §4.1 口径）
    let ciphertext = naive_extract_encrypt(&request.body);
    let expected_body = format!(
        "{}<Encrypt><![CDATA[{ciphertext}]]></Encrypt>\n</xml>",
        SAMPLE_PLAINTEXT.strip_suffix("</xml>").unwrap()
    );
    assert_eq!(request.body, expected_body);
    assert!(request
        .body
        .starts_with(SAMPLE_PLAINTEXT.strip_suffix("</xml>").unwrap()));
    // 密文可独立解回原明文
    let decrypted = decrypt_msg(GOLDEN_ENCODING_AES_KEY, ciphertext).unwrap();
    assert_eq!(decrypted.msg, SAMPLE_PLAINTEXT.as_bytes());
    assert_eq!(decrypted.receiveid, GOLDEN_APP_ID);
    assert_eq!(
        query["msg_signature"],
        build_msg_signature(
            GOLDEN_TOKEN,
            &query["timestamp"],
            &query["nonce"],
            ciphertext
        )
    );
}

#[test]
fn secure_mode_decrypts_encrypted_passive_reply_with_appid_check() {
    // 官方 §5.14 XML 加密被动回复包：Encrypt/MsgSignature/TimeStamp/Nonce
    let reply_envelope = format!(
        "<xml>\n   <Encrypt><![CDATA[{GOLDEN_REPLY_ENCRYPT}]]></Encrypt>\n   <MsgSignature><![CDATA[{GOLDEN_REPLY_SIGNATURE}]]></MsgSignature>\n   <TimeStamp>{GOLDEN_REPLY_TIMESTAMP}</TimeStamp>\n   <Nonce><![CDATA[{GOLDEN_REPLY_NONCE}]]></Nonce>\n</xml>"
    );
    let reply_envelope_for_server = reply_envelope.clone();
    let (addr, _rx) = start_single_server(
        move |_| ("HTTP/1.1 200 OK".into(), reply_envelope_for_server.clone()),
        Duration::ZERO,
    );
    let config = mp_config_with_mode(format!("http://{addr}/hook"), WechatMpMode::Secure);

    let outcome = Adapter.dispatch_event(
        &quick_client(Duration::from_secs(2)),
        &config,
        SAMPLE_PLAINTEXT,
    );

    // 原始回执原样保留；解密明文一并返回（入运行记录）
    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.body, reply_envelope);
    assert_eq!(outcome.reply.as_deref(), Some(GOLDEN_REPLY_PLAINTEXT));
    assert_eq!(outcome.error, None);
}

#[test]
fn secure_mode_ignores_reply_whose_tail_appid_mismatches() {
    // 尾部 AppId 校验失败（官方 -40001 同族语义）：不产出解密回复
    let mismatch_encrypt = encrypt_msg(
        GOLDEN_ENCODING_AES_KEY,
        &[7u8; 16],
        b"<xml/>",
        "wx_other_appid",
    )
    .unwrap();
    let envelope = format!("<xml><Encrypt><![CDATA[{mismatch_encrypt}]]></Encrypt></xml>");
    let (addr, _rx) = start_single_server(
        move |_| ("HTTP/1.1 200 OK".into(), envelope.clone()),
        Duration::ZERO,
    );
    let config = mp_config_with_mode(format!("http://{addr}/hook"), WechatMpMode::Secure);

    let outcome = Adapter.dispatch_event(
        &quick_client(Duration::from_secs(2)),
        &config,
        SAMPLE_PLAINTEXT,
    );

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.reply, None, "尾部 AppId 不符的回复不进记录");
}

#[test]
fn dispatch_reports_non_200_status_and_body() {
    let boom: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
    let (addr, _rx) = start_single_server(boom, Duration::ZERO);
    let config = mp_config(format!("http://{addr}/hook"));

    let outcome = Adapter.dispatch_event(
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
    let config = mp_config(format!("http://{addr}/hook"));

    let outcome = Adapter.dispatch_event(
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
