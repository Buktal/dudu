//! 握手与三模式直发全链路（本地 TcpListener）：GET 三参握手（成功/回显
//! 不符/非 200/超时）；明文逐字节直发、兼容并存、安全信封独立可解；XML 与
//! JSON 双回包信封解密（JSON 形态为事实库 §5.6 逐字官方样本）；尾部 AppId
//! 校验、非 200 与超时。
//! 协议原语经本渠道 Adapter 直调（收窄签名，配置判别由注册表路由保证）。

use crate::connections::wechat_common::build_msg_signature;
use crate::connections::ChannelAdapter;

use super::*;

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
    let config = mini_config(format!("http://{addr}/webhooks/wechat-mini"));
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
fn handshake_fails_when_echostr_altered() {
    // 官方明确「原样返回 echostr，不能加引号」
    let altered: fn(&HashMap<String, String>) -> (String, String) = |query| {
        (
            "HTTP/1.1 200 OK".into(),
            format!("\"{}\"", query["echostr"].clone()),
        )
    };
    let (addr, _rx) = start_get_server(altered, Duration::ZERO);
    let config = mini_config(format!("http://{addr}/hook"));
    let outcome = Adapter.verify_handshake(&quick_client(Duration::from_secs(2)), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("不一致"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_non_200() {
    let responder: fn(&HashMap<String, String>) -> (String, String) =
        |_| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
    let (addr, _rx) = start_get_server(responder, Duration::ZERO);
    let config = mini_config(format!("http://{addr}/hook"));
    let outcome = Adapter.verify_handshake(&quick_client(Duration::from_secs(2)), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("500"), "{outcome:?}");
}

#[test]
fn handshake_fails_on_timeout() {
    // 官方 5 秒应答窗口；客户端 200ms 超时 vs 服务器 1s 延迟
    let (addr, _rx) = start_get_server(echo_ok, Duration::from_secs(1));
    let config = mini_config(format!("http://{addr}/hook"));
    let outcome = Adapter.verify_handshake(&quick_client(Duration::from_millis(200)), &config);

    assert!(!outcome.ok);
    assert!(outcome.message.contains("超时"), "{outcome:?}");
}

// ---- 三模式直发全链路 ----

/// 前端确定性拼装的明文 XML（§5.3 官方客服文本消息黄金样本逐字，含三空格
/// 缩进与 MsgId 裸文本排版）。
const SAMPLE_PLAINTEXT: &str = concat!(
    "<xml>\n",
    "   <ToUserName><![CDATA[toUser]]></ToUserName>\n",
    "   <FromUserName><![CDATA[fromUser]]></FromUserName>\n",
    "   <CreateTime>1482048670</CreateTime>\n",
    "   <MsgType><![CDATA[text]]></MsgType>\n",
    "   <Content><![CDATA[this is a test]]></Content>\n",
    "   <MsgId>1234567890123456</MsgId>\n",
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
    let config = mini_config(format!("http://{addr}/hook"));

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
    let config = mini_config_with(
        format!("http://{addr}/hook"),
        WechatMiniMode::Secure,
        WechatMiniDataFormat::Xml,
    );

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
    // 信封仅两字段：ToUserName=AppID + Encrypt（事实库 §3.3，公众号同族形态）
    let ciphertext = naive_extract_encrypt(&request.body);
    let expected_envelope = format!(
        "<xml><ToUserName><![CDATA[{GOLDEN_APP_ID}]]></ToUserName><Encrypt><![CDATA[{ciphertext}]]></Encrypt></xml>"
    );
    assert_eq!(request.body, expected_envelope, "信封应逐字节等于同族形态");
    // 独立解密回原明文，尾部 AppId 须与配置相符
    let decrypted = decrypt_msg(GOLDEN_ENCODING_AES_KEY, ciphertext).unwrap();
    assert_eq!(decrypted.msg, SAMPLE_PLAINTEXT.as_bytes());
    assert_eq!(decrypted.receiveid, GOLDEN_APP_ID);
    // 四参 msg_signature 与快照一致（密文校验用 msg_signature 而非 signature）
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
    let config = mini_config_with(
        format!("http://{addr}/hook"),
        WechatMiniMode::Compatible,
        WechatMiniDataFormat::Xml,
    );

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
    // 明文与密文并存：明文逐字节保留、Encrypt 殿后（公众号同族实现）
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
fn secure_mode_decrypts_json_reply_envelope_official_sample() {
    // 官方 §5.6 加密回包信封（JSON 形态逐字）：Encrypt/MsgSignature/TimeStamp/Nonce
    let (addr, _rx) = start_single_server(
        move |_| ("HTTP/1.1 200 OK".into(), GOLDEN_REPLY_JSON_ENVELOPE.into()),
        Duration::ZERO,
    );
    let config = mini_config_with(
        format!("http://{addr}/hook"),
        WechatMiniMode::Secure,
        WechatMiniDataFormat::Xml,
    );

    let outcome = Adapter.dispatch_event(
        &quick_client(Duration::from_secs(2)),
        &config,
        SAMPLE_PLAINTEXT,
    );

    // 原始回执原样保留；解密明文一并返回（入运行记录）
    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.body, GOLDEN_REPLY_JSON_ENVELOPE);
    assert_eq!(outcome.reply.as_deref(), Some(GOLDEN_REPLY_PLAINTEXT));
    assert_eq!(outcome.error, None);
}

#[test]
fn secure_mode_decrypts_xml_reply_envelope_with_appid_check() {
    // 公众号同族 XML 回包信封：Encrypt/MsgSignature/TimeStamp/Nonce
    let reply_envelope = format!(
        "<xml>\n   <Encrypt><![CDATA[{GOLDEN_REPLY_ENCRYPT}]]></Encrypt>\n   <MsgSignature><![CDATA[{GOLDEN_REPLY_SIGNATURE}]]></MsgSignature>\n   <TimeStamp>{GOLDEN_REPLY_TIMESTAMP}</TimeStamp>\n   <Nonce><![CDATA[{GOLDEN_REPLY_NONCE}]]></Nonce>\n</xml>"
    );
    let reply_envelope_for_server = reply_envelope.clone();
    let (addr, _rx) = start_single_server(
        move |_| ("HTTP/1.1 200 OK".into(), reply_envelope_for_server.clone()),
        Duration::ZERO,
    );
    let config = mini_config_with(
        format!("http://{addr}/hook"),
        WechatMiniMode::Secure,
        WechatMiniDataFormat::Xml,
    );

    let outcome = Adapter.dispatch_event(
        &quick_client(Duration::from_secs(2)),
        &config,
        SAMPLE_PLAINTEXT,
    );

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.body, reply_envelope);
    assert_eq!(outcome.reply.as_deref(), Some(GOLDEN_REPLY_PLAINTEXT));
    assert_eq!(outcome.error, None);
}

#[test]
fn secure_mode_ignores_reply_whose_tail_appid_mismatches() {
    // 尾部 AppId 校验失败（事实库 §4.3「appid 须校验」）：不产出解密回复
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
    let config = mini_config_with(
        format!("http://{addr}/hook"),
        WechatMiniMode::Secure,
        WechatMiniDataFormat::Xml,
    );

    let outcome = Adapter.dispatch_event(
        &quick_client(Duration::from_secs(2)),
        &config,
        SAMPLE_PLAINTEXT,
    );

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.reply, None, "尾部 AppId 不符的回复不进记录");
}

#[test]
fn plain_mode_still_posts_verbatim_when_data_format_records_json() {
    // 数据格式取 XML 为主（事实库结论）：即便配置记录 JSON，明文直发仍逐字节
    // 透传模板 XML（数据格式项随连接记录目标侧形态，不改推送报文）。
    let success: fn(&RecordedPost) -> (String, String) = |_| ("HTTP/1.1 200 OK".into(), "".into());
    let (addr, rx) = start_single_server(success, Duration::ZERO);
    let config = mini_config_with(
        format!("http://{addr}/hook"),
        WechatMiniMode::Plain,
        WechatMiniDataFormat::Json,
    );

    let outcome = Adapter.dispatch_event(
        &quick_client(Duration::from_secs(2)),
        &config,
        SAMPLE_PLAINTEXT,
    );

    assert_eq!(outcome.status, 200);
    let request = rx.recv_timeout(Duration::from_secs(2)).unwrap();
    assert_eq!(request.body, SAMPLE_PLAINTEXT, "推送报文 XML 为主");
}

#[test]
fn dispatch_reports_non_200_status_and_body() {
    let boom: fn(&RecordedPost) -> (String, String) =
        |_| ("HTTP/1.1 500 Internal Server Error".into(), "boom".into());
    let (addr, _rx) = start_single_server(boom, Duration::ZERO);
    let config = mini_config(format!("http://{addr}/hook"));

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
    let config = mini_config(format!("http://{addr}/hook"));

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
