//! 小程序协议测试公共体：官方数值例常量（事实库 wechat-mini.md §3.2–§5.6
//! 逐字）+ 配置构造 + 本地 GET 监听与 query 解析基建。
//! 按职责拆分：[`golden`] 官方向量复算（无需网络）、[`chain`] 握手与直发
//! 全链路（本地 TcpListener）。网络基建在 crate::test_support（共享）；
//! AES 原语复用 wecom::crypto（事实库 §4.3 与企微同族）。

mod chain;
mod golden;

use std::collections::HashMap;
use std::io::Write;
use std::net::{Shutdown, SocketAddr, TcpListener};
use std::sync::mpsc::{channel, Receiver};
use std::time::Duration;

use crate::connections::{ConnectionConfig, WechatMiniDataFormat, WechatMiniMode};
use crate::test_support::{quick_client, read_head_and_body, start_single_server, RecordedPost};

use super::super::wecom::crypto::{decrypt_msg, encrypt_msg};
use super::*;

// ---- 官方数值例常量（message-push.html debug_demo；事实库 §3.2–§5.6） ----

/// 服务器配置示例值（事实库 §3.2/§5.2：token=AAAAA；AESKey 43 个 A；
/// AppID=wxba5fad812f8e6fb9）。
pub(super) const GOLDEN_TOKEN: &str = "AAAAA";
pub(super) const GOLDEN_ENCODING_AES_KEY: &str =
    "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
pub(super) const GOLDEN_APP_ID: &str = "wxba5fad812f8e6fb9";

/// 数值例一（GET 握手，事实库 §3.2）：token=AAAAA、timestamp=1514711492、
/// nonce=1714036504 → 排序拼接 15147114921714036504AAAAA → sha1
/// f464b24…；回包体即官方 echostr 4375120948345356249。
pub(super) const GOLDEN_HANDSHAKE_SIGNATURE: &str =
    "f464b24fc39322e44b38aa78f5edd27bd1441696";
pub(super) const GOLDEN_HANDSHAKE_TIMESTAMP: &str = "1514711492";
pub(super) const GOLDEN_HANDSHAKE_NONCE: &str = "1714036504";

/// 数值例二（明文模式三参签名，事实库 §5.1 推送 URL）：token=AAAAA、
/// timestamp=1714037059、nonce=486452656 → 899cf89e…。
pub(super) const GOLDEN_PLAIN_SIGNATURE: &str =
    "899cf89e464efb63f54ddac96b0a0a235f53aa78";
pub(super) const GOLDEN_PLAIN_TIMESTAMP: &str = "1714037059";
pub(super) const GOLDEN_PLAIN_NONCE: &str = "486452656";

/// 数值例三（安全模式收包，事实库 §4.2/§5.2）：Encrypt 224 字节密文
/// （官方页全串 300 位 Base64）、timestamp=1714112445、nonce=415670741 →
/// msg_signature=046e02f8…。
pub(super) const GOLDEN_PUSH_ENCRYPT: &str = concat!(
    "+qdx1OKCy+5JPCBFWw70tm0fJGb2Jmeia4FCB7kao+/Q5c/ohsOzQHi8khUOb05JCpj0JB4RvQMkUyus8TPxLKJGQqcvZqzDpVza",
    "zhZv6JsXUnnR8XGT740XgXZUXQ7vJVnAG+tE8NUd4yFyjPy7GgiaviNrlCTj+l5kdfMuFUPpRSrfMZuMcp3Fn2Pede2IuQrKEYwK",
    "SqFIZoNqJ4M8EajAsjLY2km32IIjdf8YL/P50F7mStwntrA2cPDrM1kb6mOcfBgRtWygb3VIYnSeOBrebufAlr7F9mFUPAJGj04=",
);
pub(super) const GOLDEN_PUSH_MSG_SIGNATURE: &str =
    "046e02f8204d34f8ba5fa3b1db94908f3df2e9b3";
pub(super) const GOLDEN_PUSH_TIMESTAMP: &str = "1714112445";
pub(super) const GOLDEN_PUSH_NONCE: &str = "415670741";

/// 数值例三解密明文（事实库 §4.3：random=a8eedb185eb2fecf、msg_len=167、
/// 尾部 appid 须校验；官方页给出完整 JSON，167 字节）。
pub(super) const GOLDEN_PUSH_PLAINTEXT: &str = concat!(
    r#"{"ToUserName":"gh_97417a04a28d","#,
    r#""FromUserName":"o9AgO5Kd5ggOC-bXrbNODIiE3bGY","#,
    r#""CreateTime":1714112445,"MsgType":"event","#,
    r#""Event":"debug_demo","debug_str":"hello world"}"#,
);

/// 数值例四（加密回包，事实库 §4.3/§5.6）：random=707722b803182950、
/// msg={"demo_resp":"good luck"}（25 字节）→ Encrypt（官方页全串）；回包
/// 签名 TimeStamp=1713424427、Nonce=415670741 → 1b933996…。官方示例回包
/// Nonce 复用推送 URL 的 nonce（§3.4：415670741 同值）。
pub(super) const GOLDEN_REPLY_ENCRYPT: &str = "ELGduP2YcVatjqIS+eZbp80MNLoAUWvzzyJxgGzxZO/5sAvd070Bs6qrLARC9nVHm48Y4hyRbtzve1L32tmxSQ==";
pub(super) const GOLDEN_REPLY_SIGNATURE: &str =
    "1b9339964ed2e271e7c7b6ff2b0ef902fc94dea1";
pub(super) const GOLDEN_REPLY_TIMESTAMP: &str = "1713424427";
pub(super) const GOLDEN_REPLY_NONCE: &str = "415670741";
pub(super) const GOLDEN_REPLY_PLAINTEXT: &str = r#"{"demo_resp":"good luck"}"#;
pub(super) const GOLDEN_REPLY_RANDOM: &[u8; 16] = b"707722b803182950";

/// 官方 §5.6 加密回包信封（JSON 形态逐字；TimeStamp 为数字、其余带引号）。
pub(super) const GOLDEN_REPLY_JSON_ENVELOPE: &str = concat!(
    "{\n",
    "    \"Encrypt\": \"ELGduP2YcVatjqIS+eZbp80MNLoAUWvzzyJxgGzxZO/5sAvd070Bs6qrLARC9nVHm48Y4hyRbtzve1L32tmxSQ==\",\n",
    "    \"MsgSignature\": \"1b9339964ed2e271e7c7b6ff2b0ef902fc94dea1\",\n",
    "    \"TimeStamp\": 1713424427,\n",
    "    \"Nonce\": \"415670741\"\n",
    "}",
);

// ---- 配置与网络基建 ----

pub(super) fn mini_config(url: String) -> ConnectionConfig {
    mini_config_with(
        url,
        WechatMiniMode::default(),
        WechatMiniDataFormat::default(),
    )
}

pub(super) fn mini_config_with(
    url: String,
    mode: WechatMiniMode,
    data_format: WechatMiniDataFormat,
) -> ConnectionConfig {
    ConnectionConfig::WechatMini {
        url,
        app_id: GOLDEN_APP_ID.into(),
        token: GOLDEN_TOKEN.into(),
        encoding_aes_key: GOLDEN_ENCODING_AES_KEY.into(),
        mode,
        data_format,
    }
}

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

pub(super) fn query_of(request_line: &str) -> HashMap<String, String> {
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
pub(super) fn start_get_server(
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
