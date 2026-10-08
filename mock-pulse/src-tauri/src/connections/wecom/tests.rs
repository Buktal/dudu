//! 企微协议全链路测试：echostr 握手（成功/带引号/非 200/超时）与直发
//! （加密信封逐字节/三种回执形态/非 200/超时）。
//! 协议原语经本渠道 Adapter 直调（收窄签名，配置判别由注册表路由保证）；
//! 网络基建在 crate::test_support（共享）；黄金例常量在 crypto（单点）。

use std::collections::HashMap;
use std::time::Duration;

use super::crypto::{GOLDEN_CORP_ID, GOLDEN_ENCODING_AES_KEY, GOLDEN_TOKEN};
use crate::connections::{ChannelAdapter, ConnectionConfig, WecomSystem};
use crate::test_support::{
    ExpectedSnapshots, assert_dispatch_error, assert_dispatch_receipt, assert_snapshots,
    query_params, run_dispatch_case, run_handshake_case, status_responder,
};

use super::*;

/// XML 自建应用通道连接配置（官方黄金例凭据；机器人通道测试在 aibot::tests）。
fn wecom_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Wecom {
        url,
        system: WecomSystem::Agent,
        corp_id: GOLDEN_CORP_ID.into(),
        token: GOLDEN_TOKEN.into(),
        encoding_aes_key: GOLDEN_ENCODING_AES_KEY.into(),
        agent_id: "218".into(),
    }
}

// ---- echostr 握手全链路：本地 TcpListener 演示成功/失败路径 ----

/// 忠实实现官方四步：① urldecode（query_params 已做）② 重算签名比对
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
    let (_outcome, request) = run_handshake_case(
        |request| {
            let query = query_params(&request.request_line);
            wecom_echo_ok(&request.request_line, &query)
        },
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| wecom_config(format!("http://{addr}/webhooks/wecom")),
        |client, config| Adapter.verify_handshake(client, config),
        true,
        &["回显"],
    );

    // 请求侧逐项核对官方协议要素
    assert!(
        request.request_line.starts_with("GET /webhooks/wecom"),
        "{}",
        request.request_line
    );
    let query = query_params(&request.request_line);
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
    run_handshake_case(
        |request| {
            let query = query_params(&request.request_line);
            let decrypted = decrypt_msg(GOLDEN_ENCODING_AES_KEY, &query["echostr"]).unwrap();
            (
                "HTTP/1.1 200 OK".into(),
                format!("\"{}\"", String::from_utf8(decrypted.msg).unwrap()),
            )
        },
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| wecom_config(format!("http://{addr}/hook")),
        |client, config| Adapter.verify_handshake(client, config),
        false,
        &["不一致"],
    );
}

#[test]
fn handshake_fails_on_non_200() {
    run_handshake_case(
        status_responder("HTTP/1.1 500 Internal Server Error", "boom"),
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| wecom_config(format!("http://{addr}/hook")),
        |client, config| Adapter.verify_handshake(client, config),
        false,
        &["500"],
    );
}

#[test]
fn handshake_fails_on_timeout() {
    // 官方要求 1 秒内响应；客户端 200ms 超时 vs 服务器 1s 延迟
    run_handshake_case(
        |request| {
            let query = query_params(&request.request_line);
            wecom_echo_ok(&request.request_line, &query)
        },
        Duration::from_secs(1),
        Duration::from_millis(200),
        |addr| wecom_config(format!("http://{addr}/hook")),
        |client, config| Adapter.verify_handshake(client, config),
        false,
        &["超时"],
    );
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
    // 前端确定性拼装的明文 XML（含非 ASCII，验证 UTF-8 字节透传）
    let plaintext = "<xml>\n   <ToUserName><![CDATA[wx5823bf96d3bd56c7]]></ToUserName>\n   <MsgType><![CDATA[text]]></MsgType>\n   <Content><![CDATA[你好，企业微信]]></Content>\n</xml>";
    let (outcome, request) = run_dispatch_case(
        status_responder("HTTP/1.1 200 OK", ""),
        plaintext,
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| wecom_config(format!("http://{addr}/hook")),
        |client, config, body| Adapter.dispatch_event(client, config, body),
    );

    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.body, "");
    assert_eq!(outcome.reply, None);
    assert_eq!(outcome.error, None);

    // 请求行：POST + msg_signature/timestamp/nonce 查询参数
    assert!(
        request.request_line.starts_with("POST /hook?"),
        "{}",
        request.request_line
    );
    let query = query_params(&request.request_line);
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
    // 企微的发送唯一标识 = nonce（统一结果的 msg_id 快照）
    assert_snapshots(
        &outcome,
        ExpectedSnapshots {
            msg_id: &query["nonce"],
            signature: &query["msg_signature"],
            timestamp: Some(&query["timestamp"]),
        },
    );
}

#[test]
fn dispatch_returns_success_receipt_verbatim() {
    let (outcome, _request) = run_dispatch_case(
        status_responder("HTTP/1.1 200 OK", "success"),
        "<xml><MsgType><![CDATA[event]]></MsgType></xml>",
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| wecom_config(format!("http://{addr}/hook")),
        |client, config, body| Adapter.dispatch_event(client, config, body),
    );

    assert_dispatch_receipt(&outcome, 200, "success");
    assert_eq!(outcome.reply, None);
}

#[test]
fn dispatch_decrypts_encrypted_passive_reply_into_record() {
    let (outcome, _request) = run_dispatch_case(
        |_request| ("HTTP/1.1 200 OK".into(), passive_reply_envelope()),
        "<xml><MsgType><![CDATA[text]]></MsgType></xml>",
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| wecom_config(format!("http://{addr}/hook")),
        |client, config, body| Adapter.dispatch_event(client, config, body),
    );

    // 原始回执原样保留；解密明文一并返回（入运行记录）
    assert_eq!(outcome.status, 200);
    assert_eq!(outcome.body, passive_reply_envelope());
    assert_eq!(outcome.reply, Some(REPLY_PLAINTEXT.to_string()));
    assert_eq!(outcome.error, None);
}

#[test]
fn dispatch_reports_non_200_status_and_body() {
    let (outcome, _request) = run_dispatch_case(
        status_responder("HTTP/1.1 500 Internal Server Error", "boom"),
        "<xml></xml>",
        Duration::ZERO,
        Duration::from_secs(2),
        |addr| wecom_config(format!("http://{addr}/hook")),
        |client, config, body| Adapter.dispatch_event(client, config, body),
    );

    assert_dispatch_receipt(&outcome, 500, "boom");
    assert_eq!(outcome.reply, None);
}

#[test]
fn dispatch_reports_timeout_without_response() {
    let (outcome, _request) = run_dispatch_case(
        status_responder("HTTP/1.1 200 OK", "success"),
        "<xml></xml>",
        Duration::from_secs(1),
        Duration::from_millis(200),
        |addr| wecom_config(format!("http://{addr}/hook")),
        |client, config, body| Adapter.dispatch_event(client, config, body),
    );

    assert_dispatch_error(&outcome, &["超时"]);
    assert_eq!(outcome.reply, None);
}
