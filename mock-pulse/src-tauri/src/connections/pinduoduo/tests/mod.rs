//! 拼多多渠道测试公共体：官方样本常量（事实库 pinduoduo.md §2.1/§4.1/§5.1 逐字）
//! + 配置构造 + 网络基建复用（crate::test_support 单请求监听）。
//! 按职责拆分：[`golden`] 官方签名黄金向量与要素形态（无需网络）、
//! [`chain`] 探针握手与直发全链路（本地 TcpListener）。

mod chain;
mod golden;

use crate::connections::ConnectionConfig;
use crate::test_support::quick_client;

use super::*;

// ---- 官方样本常量（事实库逐字） ----

/// 官方 §5.1 签名示例参数值（事实库逐字）：client_id=1 / client_secret=testSecret。
pub(super) const GOLDEN_CLIENT_ID: &str = "1";
pub(super) const GOLDEN_CLIENT_SECRET: &str = "testSecret";

/// 官方 §5.1 签名字符串（§5.1 逐字拷贝：secret 夹两端 + ASCII 升序 k+v 无缝拼接）。
pub(super) const GOLDEN_SIGN_CONCAT: &str = "testSecretaccess_tokenasd78172s8ds9a921j9qqwda12312w1w21211client_id1data_typeXMLorder_status1page1page_size10timestamp1480411125typepdd.order.number.list.gettestSecret";

/// 官方 §5.1 签名结果（事实库标注可作签名回归向量）。
pub(super) const GOLDEN_SIGN: &str = "E4DE3ED21002510DED352819E7AE6775";

/// 官方 §5.1 示例九参数（键值逐字，输入序故意乱序——官方口径即内部排序）。
pub(super) const GOLDEN_REQUEST_PARAMS: [(&str, &str); 8] = [
    ("access_token", "asd78172s8ds9a921j9qqwda12312w1w21211"),
    ("client_id", "1"),
    ("data_type", "XML"),
    ("type", "pdd.order.number.list.get"),
    ("timestamp", "1480411125"),
    ("order_status", "1"),
    ("page", "1"),
    ("page_size", "10"),
];

/// 官方 §5.1 order_status 参数词汇 + §2.1 照录状态 1 锚定的订单推送样本明文
/// （order_id 为通名暂代——官方字段名待核验(09-27)，事实库模拟口径仅「含订单号」）。
pub(super) const GOLDEN_ORDER_PLAINTEXT: &str =
    r#"{"order_id":"110770592823138","order_status":2}"#;

pub(super) fn pinduoduo_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Pinduoduo {
        url,
        client_id: GOLDEN_CLIENT_ID.into(),
        client_secret: GOLDEN_CLIENT_SECRET.into(),
    }
}

/// quick 客户端别名（网络基建在 crate::test_support 共享）。
pub(super) fn client() -> reqwest::blocking::Client {
    quick_client(std::time::Duration::from_secs(2))
}
