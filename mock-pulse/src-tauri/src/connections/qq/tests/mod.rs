//! QQ 渠道测试公共体：官方向量常量（事实库 qq.md §3.2/§4.2/§5.2 逐字）+
//! 配置构造 + 回包构造 + 网络基建复用。
//! 按职责拆分：[`golden`] 「op13 请求体 → 目标回包 → 验签」与事件签名链路
//! 复算（无需网络）、[`chain`] 握手与直发全链路（本地 TcpListener）。

mod chain;
mod golden;

use crate::connections::ConnectionConfig;
use crate::test_support::quick_client;

use super::*;

// ---- 官方向量常量（事实库 §3.2/§5.2，逐字） ----

/// 官方 op13 示例账号（webhook 页原文）：appid 11111111 / secret DG5g3B4j9X2KOErG。
pub(super) const GOLDEN_APP_ID: &str = "11111111";
pub(super) const GOLDEN_APP_SECRET: &str = "DG5g3B4j9X2KOErG";

/// 官方 op13 示例（webhook 页逐字）：plain_token/event_ts 与期望回包签名。
pub(super) const GOLDEN_PLAIN_TOKEN: &str = "Arq0D5A61EgUu4OxUvOp";
pub(super) const GOLDEN_EVENT_TS: &str = "1725442341";
pub(super) const GOLDEN_SIGNATURE: &str = "87befc99c42c651b3aac0278e71ada338433ae26fcb24307bdc5ad38c1adc2d01bcfcadc0842edac85e85205028a1132afe09280305f13aa6909ffc2d652c706";

/// 事实库 §5.3 C2C_MESSAGE_CREATE 黄金样本（紧凑单行 = 直发的线上信封形态；
/// d 内容逐字，信封四件套 id/op/s/t 按 §5.1 官方形态）。
pub(super) const GOLDEN_EVENT_PLAINTEXT: &str = concat!(
    r#"{"id":"ROBOT1.0_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx","op":0,"#,
    r#""d":{"id":"ROBOT1.0_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx","#,
    r#""author":{"id":"A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4","#,
    r#""user_openid":"A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4","union_openid":"","username":"","bot":false},"#,
    r#""content":"你好，今天有什么推荐的活动吗？","message_type":0,"#,
    r#""message_scene":{"source":"default","ext":["msg_idx=REFIDX_xxxxxxxxxxxxxxx=="]},"#,
    r#""timestamp":"2026-07-21T10:00:00+08:00"},"s":42,"t":"C2C_MESSAGE_CREATE"}"#
);

// ---- 配置构造 ----

pub(super) fn qq_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Qq {
        url,
        app_id: GOLDEN_APP_ID.into(),
        app_secret: GOLDEN_APP_SECRET.into(),
    }
}

// ---- 测试侧公共构造 ----

/// 忠实目标侧实现（事实库 §3.2）：收 op13 请求后回
/// `{"plain_token":<同值>,"signature":hex(Ed25519.Sign(priv, event_ts+plain_token))}`。
/// secret 固定官方向量凭据，签名对官方 event_ts 复算可对拍（golden 向量）。
pub(super) fn reply_validation(
    request: &crate::test_support::RecordedPost,
) -> (String, String) {
    let payload: serde_json::Value = serde_json::from_str(&request.body).unwrap();
    let d = &payload["d"];
    let plain_token = d["plain_token"].as_str().unwrap();
    let event_ts = d["event_ts"].as_str().unwrap();
    let signature = sign::sign_validation(GOLDEN_APP_SECRET, event_ts, plain_token);
    let body = serde_json::json!({ "plain_token": plain_token, "signature": signature })
        .to_string();
    ("HTTP/1.1 200 OK".into(), body)
}

/// quick 客户端别名（网络基建在 crate::test_support 共享）。
pub(super) fn client() -> reqwest::blocking::Client {
    quick_client(std::time::Duration::from_secs(2))
}
