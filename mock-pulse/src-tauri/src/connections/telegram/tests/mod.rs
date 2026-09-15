//! Telegram 渠道测试公共体：官方样本常量（事实库 telegram.md §4.1/§5.2 逐字）
//! + 配置构造 + 网络基建复用（crate::test_support 单请求监听）。
//! 按职责拆分：[`golden`] secret_token 边界与 Update 形态（无需网络）、
//! [`chain`] 探针与直发全链路（本地 TcpListener）。

mod chain;
mod golden;

use crate::connections::ConnectionConfig;
use crate::test_support::quick_client;

use super::*;

// ---- 官方样本常量（事实库逐字） ----

/// 官方 §4.1 口径锚定的 secret_token（webhook 恒等头值；官方未给样例原文，
/// 取合法字符集内的测试值，原样比对无 HMAC）。
pub(super) const GOLDEN_SECRET_TOKEN: &str = "tg-webhook-secret_Test-01";

/// §5.2 callback_query 核验样本明文（官方 JSON 样本值逐字、压为单行，
/// update_id 10000 官方示意值）。
pub(super) const GOLDEN_CALLBACK_PLAINTEXT: &str = concat!(
    r#"{"update_id":10000,"callback_query":{"id": "4382bfdwdsb323b2d9","#,
    r#""from":{"last_name":"Test Lastname","type": "private","id":1111111,"#,
    r#""first_name":"Test Firstname","username":"Testusername"},"#,
    r#""data": "Data from button callback","inline_message_id": "1234csdbsk4839"}}"#
);

pub(super) fn telegram_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Telegram {
        url,
        secret_token: GOLDEN_SECRET_TOKEN.into(),
    }
}

/// quick 客户端别名（网络基建在 crate::test_support 共享）。
pub(super) fn client() -> reqwest::blocking::Client {
    quick_client(std::time::Duration::from_secs(2))
}
