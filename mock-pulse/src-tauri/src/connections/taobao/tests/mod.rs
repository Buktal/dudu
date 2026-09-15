//! 淘宝渠道测试公共体：官方样本常量（事实库 taobao.md §4.2/§5.3–§5.6/§5.8 逐字）
//! + 配置构造 + 网络基建复用（crate::test_support 单请求监听）。
//! 按职责拆分：[`golden`] 验签黄金向量与信封形态（无需网络）、
//! [`chain`] 握手与直发全链路（本地 TcpListener）。

mod chain;
mod golden;

use crate::connections::ConnectionConfig;
use crate::test_support::quick_client;

use super::*;

// ---- 官方样本常量（事实库逐字） ----

/// 官方 §4.2 验签示例的 AppKey：「base = {AppKey} + {messageBody}，如 "123456" + …」。
pub(super) const GOLDEN_APP_KEY: &str = "123456";
/// 测试 AppSecret（官方未给样例密钥原文，签名回归向量取 Node crypto 交叉复算）。
pub(super) const GOLDEN_APP_SECRET: &str = "taobao_app_secret";

/// 官方样例请求头的 Authorization 值（§5.6 逐字）：64 位小写 hex 形态锚点。
/// 官方未给该样例的 AppKey/AppSecret 原文，无法作对拍回归向量（回归向量见
/// golden.rs 的 Node 交叉复算）。
pub(super) const OFFICIAL_HEADER_SAMPLE: &str =
    "34f7b258df045d4ed9341850ca85b866f34828fd7d51862f11137216294a894c";

/// §5.3 TradeCreate 载荷逐字（键序同官方文档，数字字段全字符串形态）。
pub(super) const GOLDEN_TRADE_PLAINTEXT: &str = concat!(
    r#"{"buyer_nick":"碎**","buyer_open_uid":"AAGq5d-EAAeG3JedwSFpZMe1","#,
    r#""payment":"100.00","oid":"987654321","seller_nick":"麦包包","type":"fixed","#,
    r#""tid":"123456789","status":"TRADE_CREATE"}"#
);

/// §5.4 RefundCreated 载荷逐字（键序同官方文档）。
pub(super) const GOLDEN_REFUND_PLAINTEXT: &str = concat!(
    r#"{"buyer_nick":"碎**","buyer_open_uid":"AAGq5d-EAAeG3JedwSFpZMe1","#,
    r#""refund_phase":"onsale","refund_fee":"21.32","bill_type":"refund_bill","#,
    r#""modified":"2000-12-30 12:32:20","oid":"110770592823138","seller_nick":"麦包包","#,
    r#""refund_id":"592823138","tid":"110770592823138"}"#
);

/// §5.8 旺旺聊天 envelope 逐字（形态参考；OffMsgPush 载荷全文待核验(09-27)）。
pub(super) const GOLDEN_OFFMSG_PLAINTEXT: &str = concat!(
    r#"{"content":"文本啊啊啊","to_id":"it3d3hxlxiaomishu","nickname":"it3d3hxltest0","#,
    r#""from_id":"it3d3hxltest0","gmt_send":"1444297001","msg_id":"6269105334747922432"}"#
);

/// 官方样本业务幂等键（msg_id 快照断言用）。
pub(super) const GOLDEN_TRADE_TID: &str = "123456789";
pub(super) const GOLDEN_REFUND_TID_ALT: &str = "110770592823138";
pub(super) const GOLDEN_REFUND_ID: &str = "592823138";
pub(super) const GOLDEN_OFFMSG_MSG_ID: &str = "6269105334747922432";
pub(super) const GOLDEN_FORWARD_TRADE_ORDER_ID: &str = "260422900198363";

pub(super) fn taobao_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Taobao {
        url,
        app_key: GOLDEN_APP_KEY.into(),
        app_secret: GOLDEN_APP_SECRET.into(),
    }
}

/// quick 客户端别名（网络基建在 crate::test_support 共享）。
pub(super) fn client() -> reqwest::blocking::Client {
    quick_client(std::time::Duration::from_secs(2))
}
