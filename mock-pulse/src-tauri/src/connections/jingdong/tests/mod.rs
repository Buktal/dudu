//! 京东渠道测试公共体：官方样本常量（事实库 jingdong.md §4.1/§5.1/§5.3 逐字）
//! + 配置构造 + 网络基建复用（crate::test_support 单请求监听）。
//! 按职责拆分：[`golden`] 签名黄金向量与探针样本形态（无需网络）、
//! [`chain`] 探针握手与直发全链路（本地 TcpListener）。

mod chain;
mod golden;

use crate::connections::ConnectionConfig;
use crate::test_support::quick_client;

use super::*;

// ---- 官方样本常量（事实库逐字） ----

/// 官方 §5.1 签名示例的参数值（事实库逐字）：app_key=yourappkey /
/// appSecret=yourappSecret / timestamp=2021-05-07 09:20:39 / v=2.0。
/// 官方给出的 MD5 结果（30902CFA…）依赖示例 JSON 的确切字节序，文档版式
/// 无法逐字复原（换行/空白不可考），不作对拍向量——对拍取 Node crypto
/// 交叉复算（golden.rs），官方参数值本身仍逐字锚定拼接口径。
pub(super) const GOLDEN_APP_KEY: &str = "yourappkey";
pub(super) const GOLDEN_APP_SECRET: &str = "yourappSecret";
pub(super) const GOLDEN_TIMESTAMP: &str = "2021-05-07 09:20:39";

/// 官方 §5.2 SDK 示例状态枚举（TRADE_CANCELED 逐字）锚定的订单推送样本明文
/// （骨架同款实锤词汇 order_id/order_state，事实库 §5.1/§2.1）。
pub(super) const GOLDEN_ORDER_PLAINTEXT: &str =
    r#"{"order_id":"110770592823138","order_state":"TRADE_CANCELED"}"#;

/// 咚咚 push2 五参数样本明文（§5.3 参数表逐字，operatePin 样本 testPin 即
/// 官方原文）。
pub(super) const GOLDEN_PUSH2_PLAINTEXT: &str = concat!(
    r#"{"buId":"123456","operatePin":"testPin","operateNick":"测试客服","#,
    r#""serviceId":"1001","orderId":"123456789"}"#
);

pub(super) fn jingdong_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Jingdong {
        url,
        app_key: GOLDEN_APP_KEY.into(),
        app_secret: GOLDEN_APP_SECRET.into(),
    }
}

/// quick 客户端别名（网络基建在 crate::test_support 共享）。
pub(super) fn client() -> reqwest::blocking::Client {
    quick_client(std::time::Duration::from_secs(2))
}
