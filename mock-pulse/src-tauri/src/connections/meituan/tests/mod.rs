//! 美团渠道测试公共体：官方样本常量（事实库 meituan.md §4.1/§5.1/§5.3 逐字）
//! + 配置构造 + 网络基建复用（crate::test_support 单请求监听）。
//! 按职责拆分：[`golden`] 官方签名黄金向量与表单编解码语义（无需网络）、
//! [`chain`] 探针握手与直发全链路（本地 TcpListener）。

mod chain;
mod golden;

use crate::connections::ConnectionConfig;
use crate::test_support::quick_client;

use super::*;

// ---- 官方样本常量（事实库逐字） ----

/// 官方 §5.1 签名示例（guide/31 逐字）：待签串的请求 url 部分。
pub(super) const GOLDEN_URL: &str = "http://waimaiopen.meituan.com/api/v1/poi/mget";

/// 官方 §5.1 签名示例参数值（事实库逐字；app_poi_codes 为待签串原文的复数
/// 形态——官方「排序后」行写作 app_poi_code，与待签串不一致，照录待签串）。
pub(super) const GOLDEN_REQUEST_PARAMS: [(&str, &str); 3] = [
    ("app_id", "1235123121"),
    ("app_poi_codes", "31"),
    ("timestamp", "1389751221"),
];

/// 官方 §5.1 示例 app secret（consumer_secret，事实库逐字）。
pub(super) const GOLDEN_SECRET: &str = "d31ba58fd73c71db697ab5e4946d52d";

/// 官方 §5.1 待签串（逐字拷贝：url + ? + 字母序 k=v & 连接 + secret 无缝拼接）。
pub(super) const GOLDEN_SIGN_CONCAT: &str = "http://waimaiopen.meituan.com/api/v1/poi/mget?app_id=1235123121&app_poi_codes=31&timestamp=1389751221d31ba58fd73c71db697ab5e4946d52d";

/// 官方 §5.1 签名结果（事实库逐字，32 位小写 hex）。
pub(super) const GOLDEN_SIGN: &str = "00934d00d0aea6f12161edfb6456143d";

/// 官方 §5.3 订单核验样本表单（docDetail/177/180 字段值逐字；form 字节，
/// wm_poi_name/backup_recipient_phone 按 RFC 3986 大写 hex 百分号编码）：
/// 探针与直发样本同源，msg_id 快照取 order_id。
pub(super) const GOLDEN_ORDER_BODY: &str = "app_poi_code=668921&order_id=27061900338318741&wm_poi_name=%E8%8D%AF%E5%93%8101%E5%BA%97";

pub(super) fn meituan_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Meituan {
        url,
        app_id: "1235123121".into(),
        app_secret: GOLDEN_SECRET.into(),
    }
}

/// quick 客户端别名（网络基建在 crate::test_support 共享）。
pub(super) fn client() -> reqwest::blocking::Client {
    quick_client(std::time::Duration::from_secs(2))
}
