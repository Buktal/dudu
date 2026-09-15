//! B站渠道测试公共体：官方样本常量（事实库 bilibili.md §5.3/§5.5/§3.2 逐字）
//! + 配置构造 + 网络基建复用（crate::test_support 单请求监听）。
//! 按职责拆分：[`golden`] 签名自反对拍与信封形态（无需网络）、
//! [`chain`] verify_webhooks 握手与直发全链路（本地 TcpListener）。

mod chain;
mod golden;

use crate::connections::ConnectionConfig;
use crate::test_support::quick_client;

use super::*;

// ---- 官方样本常量（事实库逐字） ----

/// 官方 §5.3 deauthorize 样本 client_id（16 位小写 hex，即 x-bili-accesskeyid）。
pub(super) const GOLDEN_CLIENT_ID: &str = "395c8275dd674f17";
/// 官方 §5.3 样本 openid（32 位字母数字混淆串，尾部空格原文照录）。
pub(super) const GOLDEN_OPENID: &str = "9205eeaa1879skxys969ed47874f225c3 ";
/// 官方示例 timestamp（§5 示例占位，yyyy-MM-dd HH:mm:ss、UTC+8 字符串形态）。
pub(super) const GOLDEN_TIMESTAMP: &str = "2021-01-01 12:01:01";
/// 官方 §3.2 verify_webhooks 样本 data（镜像原文逐字，10 位整数占位）。
pub(super) const GOLDEN_PROBE_DATA: i64 = 1371848576;

/// App Secret 无官方样本（事实库仅「应用的 secret」口径），取测试值；
/// 回归锚点为「签名→验签」自反 + 篡改必败，不依赖该字面值。
pub(super) const GOLDEN_APP_SECRET: &str = "bilibili-open-platform-secret";

/// §5.3 deauthorize 样本逐字（官方事件页印证条；单行紧凑化、openid 尾部
/// 空格原文保留），直发与签名全链路共用。
pub(super) const GOLDEN_EVENT_PLAINTEXT: &str = concat!(
    r#"{"event":"deauthorize","content":{"openid":"9205eeaa1879skxys969ed47874f225c3 ","#,
    r#""client_id":"395c8275dd674f17","permits":"ATC_DATA, ATC_BASE"},"#,
    r#""timestamp":"2021-01-01 12:01:01"}"#
);

pub(super) fn bilibili_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Bilibili {
        url,
        client_id: GOLDEN_CLIENT_ID.into(),
        app_secret: GOLDEN_APP_SECRET.into(),
    }
}

/// quick 客户端别名（网络基建在 crate::test_support 共享）。
pub(super) fn client() -> reqwest::blocking::Client {
    quick_client(std::time::Duration::from_secs(2))
}
