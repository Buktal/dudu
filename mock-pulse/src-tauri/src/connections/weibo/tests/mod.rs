//! 微博渠道测试公共体：官方黄金算例常量（事实库 weibo.md §3.1 逐字）+
//! 配置构造 + 网络基建复用。
//! 按职责拆分：[`golden`] 黄金算例验签与随机要素形态（无需网络）、
//! [`chain`] 握手与直发全链路（本地 TcpListener）。

mod chain;
mod golden;

use crate::connections::ConnectionConfig;
use crate::test_support::quick_client;

use super::*;

// ---- 官方黄金算例常量（事实库 §3.1，逐字） ----

/// 官方算例三参：appsecret=xyz123xyz（原文键名笔误作 appsercret，值照录）、
/// timestamp=1397022061823（13 位毫秒形态）、nonce=57155157（8 位数字）。
pub(super) const GOLDEN_APP_SECRET: &str = "xyz123xyz";
pub(super) const GOLDEN_TIMESTAMP: &str = "1397022061823";
pub(super) const GOLDEN_NONCE: &str = "57155157";
/// 官方 sha1 结果：90e4c22c90a58f26526c2dd5b6c56c8822edeaa1。
pub(super) const GOLDEN_SIGNATURE: &str = "90e4c22c90a58f26526c2dd5b6c56c8822edeaa1";
/// 官方验证请求样例的 echostr（回显该值即通过）。
pub(super) const GOLDEN_ECHOSTR: &str = "dnPdpTZz85";

/// 官方算例拼接串（排序后 timestamp < nonce < appsecret，直接拼接）。
pub(super) const GOLDEN_CONCATENATED: &str = "139702206182357155157xyz123xyz";

// ---- 配置构造 ----

pub(super) fn weibo_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Weibo {
        url,
        app_secret: GOLDEN_APP_SECRET.into(),
    }
}

/// 前端确定性拼装的 JSON 黄金载荷（事实库 §5.1 纯文本私信逐字，紧凑单行 =
/// 直发的线上形态；receiver_id/sender_id 为 int64 数字 UID）。
pub(super) const GOLDEN_EVENT_PLAINTEXT: &str = concat!(
    r#"{"type":"text","receiver_id":1902538057,"sender_id":2489518277,"#,
    r#""created_at":"Mon Jul 16 18:09:20 +0800 2012","text":"私信或留言内容","data":{}}"#
);

/// quick 客户端别名（网络基建在 crate::test_support 共享）。
pub(super) fn client() -> reqwest::blocking::Client {
    quick_client(std::time::Duration::from_secs(2))
}
