//! 快手渠道测试公共体：官方验证示例常量（事实库 kuaishou.md §4.1 逐字）+
//! 配置构造 + 网络基建复用（crate::test_support 单请求监听）。
//! 按职责拆分：[`golden`] 验签黄金向量与信封形态（无需网络）、
//! [`chain`] 握手与直发全链路（本地 TcpListener）。

mod chain;
mod golden;

use crate::connections::ConnectionConfig;
use crate::test_support::quick_client;

use super::*;

// ---- 官方验证示例常量（事实库 §4.1，逐字） ----

/// 官方验证示例 AppSecret：Xgm23lSgws235hlgK。
pub(super) const GOLDEN_APP_SECRET: &str = "Xgm23lSgws235hlgK";
/// 官方 §4.1 PAYMENT 信封样本值：message_id（UUID 形态）/ app_id / timestamp
/// （data 段官方省略未给出）。
pub(super) const GOLDEN_MESSAGE_ID: &str = "76a50e0c-a843-492b-9bc6-463c1b178a9c";
pub(super) const GOLDEN_APP_ID: &str = "ks696650570360602063";
pub(super) const GOLDEN_TIMESTAMP: u64 = 1631515320564;
/// 官方请求示例 header 的 kwaisign 值（事实库 §4.1 逐字；复核注：该值即
/// MD5("123456")，作独立锚点、不作回归向量——回归向量见 golden.rs 交叉复算）。
pub(super) const OFFICIAL_HEADER_SAMPLE: &str = "e10adc3949ba59abbe56e057f20f883e";

/// §4.1 信封键序 + 官方样本值构造的 PAYMENT 回调明文（data 段官方省略，
/// 按事实库 §2.2 status 枚举 PROCESSING/SUCCESS/FAILED 取 SUCCESS 构造）。
pub(super) const GOLDEN_EVENT_PLAINTEXT: &str = concat!(
    r#"{"data":{"status":"SUCCESS"},"biz_type":"PAYMENT","#,
    r#""message_id":"76a50e0c-a843-492b-9bc6-463c1b178a9c","#,
    r#""app_id":"ks696650570360602063","timestamp":1631515320564}"#
);

pub(super) fn kuaishou_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Kuaishou {
        url,
        app_id: GOLDEN_APP_ID.into(),
        app_secret: GOLDEN_APP_SECRET.into(),
    }
}

/// quick 客户端别名（网络基建在 crate::test_support 共享）。
pub(super) fn client() -> reqwest::blocking::Client {
    quick_client(std::time::Duration::from_secs(2))
}
