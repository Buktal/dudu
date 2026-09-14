//! 飞书协议测试公共体：官方数值例常量（事实库 feishu.md §3.2/§4.2/§4.3/§5.4
//! 逐字 + Node crypto 交叉复算向量）+ 配置构造 + 网络基建复用。
//! 按职责拆分：[`golden`] 官方向量与「样本 → AES → 验签」链路复算（无需网络）、
//! [`chain`] 握手与直发全链路（本地 TcpListener）。

mod chain;
mod golden;

use crate::connections::ConnectionConfig;
use crate::test_support::{quick_client, RecordedPost};

use super::*;

// ---- 官方向量常量（事实库 §4.2/§4.3；Node crypto 交叉复算） ----

/// 官方 §4.3 加密策略样例：Encrypt Key = `test key`、密文 `P37w…`、
/// 明文 `hello world`（官方断言解密结果；Java/Go 版行内注释 `//hello world`）。
pub(super) const GOLDEN_ENCRYPT_KEY: &str = "test key";
pub(super) const GOLDEN_ENCRYPT: &str = "P37w+VZImNgPEO1RBhJ6RtKl7n6zymIbEG1pReEzghk=";
pub(super) const GOLDEN_PLAINTEXT: &str = "hello world";

/// key 派生向量：sha256("test key")（Node crypto 交叉复算，64 位小写 hex）。
pub(super) const GOLDEN_AES_KEY_HEX: &str =
    "fa2bdca424f01f01ffb48df93acc35d439c7fd331a1a7fba6ac2fd83aa9ab31a";

/// 签名向量（官方 §4.2 算法，Node crypto 交叉复算）：
/// sha256(timestamp + nonce + encrypt_key + body)，body 为加密信封原始字节。
pub(super) const GOLDEN_SIGNATURE_TIMESTAMP: &str = "1608725989";
pub(super) const GOLDEN_SIGNATURE_NONCE: &str = "5e3702a84e847582be8db7fb73283c02";
pub(super) const GOLDEN_SIGNATURE_BODY: &str =
    r#"{"encrypt":"P37w+VZImNgPEO1RBhJ6RtKl7n6zymIbEG1pReEzghk="}"#;
pub(super) const GOLDEN_SIGNATURE: &str =
    "d6022e3ed080491cf61a26d64a132f8dcf090e73d2d0411c8a6f002e8e990941";

/// 事实库 §3.2 验证请求三参样本（challenge/token/type 逐字；token 为占位原文）。
pub(super) const GOLDEN_VERIFICATION_TOKEN: &str = "xxxxxx";

/// 事件 header token（事实库 §5.4–§5.7 官方样本逐字；Verification Token 明文
/// 比对形态）。
pub(super) const GOLDEN_EVENT_TOKEN: &str = "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV";

/// 事实库 §5.4 im.message.receive_v1 官方样本（逐字，紧凑单行 = 本工具直发
/// 的线上明文形态；官方占位 xx 段照录）。
pub(super) const GOLDEN_EVENT_PLAINTEXT: &str = concat!(
    r#"{"schema":"2.0","#,
    r#""header":{"event_id":"5e3702a84e847582be8db7fb73283c02","#,
    r#""event_type":"im.message.receive_v1","create_time":"1608725989000","#,
    r#""token":"rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV","#,
    r#""app_id":"cli_9f5343c580712544","tenant_key":"2ca1d211f64f6438"},"#,
    r#""event":{"sender":{"sender_id":{"union_id":"on_8ed6aa67826108097d9ee143816345","#,
    r#""user_id":"e33ggbyz","open_id":"ou_84aad35d084aa403a838cf73ee18467"},"#,
    r#""sender_type":"user","tenant_key":"736588c9260f175e"},"#,
    r#""message":{"message_id":"om_5ce6d572455d361153b7cb51da133945","#,
    r#""root_id":"om_5ce6d572455d361153b7cb5xxfsdfsdfdsf","#,
    r#""parent_id":"om_5ce6d572455d361153b7cb5xxfsdfsdfdsf","#,
    r#""create_time":"1609073151345","update_time":"1687343654666","#,
    r#""chat_id":"oc_5ce6d572455d361153b7xx51da133945","thread_id":"omt_d4be107c616","#,
    r#""chat_type":"group","message_type":"text","content":"{\"text\":\"@_user_1 hello\"}","#,
    r#""mentions":[{"key":"@_user_1","id":{"union_id":"on_8ed6aa67826108097d9ee143816345","#,
    r#""user_id":"e33ggbyz","open_id":"ou_84aad35d084aa403a838cf73ee18467"},"#,
    r#""mentioned_type":"user","name":"Tom","tenant_key":"736588c9260f175e"}],"#,
    r#""user_agent":"Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.53 Safari/537.36 Lark/6.7.5 LarkLocale/en_US ttnet SDK-Version/6.7.8"}}}"#,
);

// ---- 配置构造 ----

pub(super) fn feishu_plain_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Feishu {
        url,
        app_id: "cli_9f5343c580712544".into(),
        verification_token: GOLDEN_EVENT_TOKEN.into(),
        encrypt_key: String::new(),
    }
}

pub(super) fn feishu_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Feishu {
        url,
        app_id: "cli_9f5343c580712544".into(),
        verification_token: GOLDEN_EVENT_TOKEN.into(),
        encrypt_key: GOLDEN_ENCRYPT_KEY.into(),
    }
}

// ---- 测试侧公共解析 ----

/// 测试侧独立解信封：取 `{"encrypt":"…"}` 的字段值经生产解密原语还原明文
/// （解密路径已由官方回归向量独立验证，链路测试只做结构核对）。
pub(super) fn decrypt_request_encrypt(body: &str) -> Vec<u8> {
    let parsed: serde_json::Value = serde_json::from_str(body).expect("请求体应为合法 JSON");
    let encrypt = parsed["encrypt"].as_str().expect("信封应有 encrypt 字段");
    crypto::decrypt_event(GOLDEN_ENCRYPT_KEY, encrypt).expect("信封应可解密")
}

/// 响应体即官方回显形态 `{"challenge":"<请求值>"}`（字符串原样）。忠实实现
/// 官方双格式：明文三参直接取 challenge；加密信封先解密再取 challenge 内值。
pub(super) fn echo_challenge(request: &RecordedPost) -> (String, String) {
    let parsed: serde_json::Value = serde_json::from_str(&request.body).unwrap();
    let challenge = match parsed["challenge"].as_str() {
        Some(challenge) => challenge.to_string(),
        None => {
            let plaintext = decrypt_request_encrypt(&request.body);
            let inner: serde_json::Value = serde_json::from_slice(&plaintext).unwrap();
            inner["challenge"]
                .as_str()
                .expect("明文应有字符串 challenge")
                .to_string()
        }
    };
    (
        "HTTP/1.1 200 OK".into(),
        format!("{{\"challenge\":\"{challenge}\"}}"),
    )
}

/// quick 客户端别名（网络基建在 crate::test_support 共享）。
pub(super) fn client() -> reqwest::blocking::Client {
    quick_client(std::time::Duration::from_secs(2))
}
