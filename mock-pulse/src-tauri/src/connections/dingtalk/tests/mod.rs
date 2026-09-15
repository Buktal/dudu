//! 钉钉协议测试公共体：官方调试向量常量（事实库 dingtalk.md §4.1/§5.1/§5.7/§5.10
//! 逐字）+ 配置构造 + 回包构造 + 网络基建复用。
//! 按职责拆分：[`golden`] 「黄金样本 → 加密 → 验签」链路复算（无需网络）、
//! [`chain`] 握手与直发全链路（本地 TcpListener）。

mod chain;
mod golden;

use crate::connections::wecom::random_16;
use crate::connections::ConnectionConfig;
use crate::test_support::quick_client;

use super::*;

// ---- 官方向量常量（事实库 §4.1 调试向量 A + §5.7 机器人样例，逐字） ----

/// 调试向量 A 凭据：TOKEN=123456、ENCODING_AES_KEY（43 位）、KEY=suite4xxxxxxxxxxxxxxx。
pub(super) const GOLDEN_TOKEN: &str = "123456";
pub(super) const GOLDEN_ENCODING_AES_KEY: &str = "4g5j64qlyl3zvetqxz5jiocdr586fn2zvjpa8zls3ij";
pub(super) const GOLDEN_OWNER_KEY: &str = "suite4xxxxxxxxxxxxxxx";

/// 官方 §5.7 机器人样例：appSecret = "this is a secret"（sign 列为占位符，
/// 期望值由 Node crypto 交叉复算，见 bot 模块测试）。
pub(super) const GOLDEN_APP_SECRET: &str = "this is a secret";

/// 事实库 §5.4 bpms_instance_change 官方样本（HTTP 大写信封逐字，紧凑单行 =
/// 本工具直发的线上明文形态；官方占位 xx 段照录）。
pub(super) const GOLDEN_EVENT_PLAINTEXT: &str = concat!(
    r#"{"EventType":"bpms_instance_change","EventTime":1663143335567,"#,
    r#""CorpId":"ding9f50b15bxxxx16741","BizId":"1663**35567","#,
    r#""eventId":"c7c7120f2c07419**ebdba0318c8","result":"agree","#,
    r#""processInstanceId":"9Qgx5QqjR7axMwxxxx","finishTime":1495592272000,"#,
    r#""createTime":1495592305000,"processCode":"Pro-xxx","#,
    r#""bizCategoryId":"20230xxx","businessId":"yewu1","type":"finish","#,
    r#""title":"自测-1016","businessType":"yewu1","#,
    r#""url":"https://aflow.dingtalk.com/dingtalk/mobile/homepage.htm?corpid=ding2c015874d817xxxx&dd_share=","#,
    r#""staffId":"manager75"}"#
);

// ---- 配置构造 ----

pub(super) fn dingtalk_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Dingtalk {
        url,
        system: super::super::DingtalkSystem::HttpCrypto,
        token: GOLDEN_TOKEN.into(),
        encoding_aes_key: GOLDEN_ENCODING_AES_KEY.into(),
        owner_key: GOLDEN_OWNER_KEY.into(),
        app_secret: String::new(),
    }
}

pub(super) fn bot_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Dingtalk {
        url,
        system: super::super::DingtalkSystem::Bot,
        token: String::new(),
        encoding_aes_key: String::new(),
        owner_key: String::new(),
        app_secret: GOLDEN_APP_SECRET.into(),
    }
}

// ---- 测试侧公共构造 ----

/// 忠实目标侧实现（§5.6/§5.10）：收任意推送后回加密 success 包——
/// encrypt = enc("success")，msg_signature 按 sha1 四参对本回包要素重算。
pub(super) fn reply_success_envelope(
    _request: &crate::test_support::RecordedPost,
) -> (String, String) {
    let encrypt = crypto::encrypt_msg(
        GOLDEN_ENCODING_AES_KEY,
        &random_16(),
        b"success",
        GOLDEN_OWNER_KEY,
    )
    .unwrap();
    let timestamp = "1783610513".to_string();
    let nonce = "w2WPvWxxxxGOmIB".to_string();
    let signature = crypto::build_signature(GOLDEN_TOKEN, &timestamp, &nonce, &encrypt);
    let body = serde_json::json!({
        "msg_signature": signature,
        "timeStamp": timestamp,
        "nonce": nonce,
        "encrypt": encrypt,
    })
    .to_string();
    ("HTTP/1.1 200 OK".into(), body)
}

/// quick 客户端别名（网络基建在 crate::test_support 共享）。
pub(super) fn client() -> reqwest::blocking::Client {
    quick_client(std::time::Duration::from_secs(2))
}
