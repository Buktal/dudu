//! 小红书渠道测试公共体：官方样本常量（事实库 xiaohongshu.md 逐字）+ 配置
//! 构造 + 网络基建复用。
//! 按职责拆分：[`golden`] 黄金样本 → AES（官方 MsgDecrypt 算法）→ sha1 验签
//! 链路（无需网络）、[`chain`] 握手与双通道直发全链路（本地 TcpListener）。

mod chain;
mod golden;

use crate::connections::ConnectionConfig;
use crate::test_support::quick_client;

use super::*;

// ---- 官方样本常量（事实库 §10.3/§11.3，逐字） ----

/// 小程序客服消息官方样本（§10.3 逐字）：紧凑单行 = 直发/加密的线上形态。
pub(super) const GOLDEN_MESSAGE_PLAINTEXT: &str = r#"{"MsgId":"MSG_ID","FromOpenId":"USER_OPEN_ID","ToAppId":"SELLER_APP_ID","MsgType":"text","CreateTime":1648714429,"Content":"..."}"#;

/// ark 官方构造示例（§5.4 逐字，紧凑单行 = 数组包裹前的线上形态）。
pub(super) const GOLDEN_ARK_ENVELOPE: &str = r#"{"msgTag":"msg_fulfillment_status_change","sellerId":"5e8e****","data":"{\"orderId\":\"P01****\",\"updateTime\":1693500000,\"orderStatus\":4}"}"#;

/// 测试用连接凭据（官方无黄金算例，固定值供独立复算对拍）。
pub(super) const GOLDEN_TOKEN: &str = "xhsTestToken";
pub(super) const GOLDEN_ENCODING_AES_KEY: &str = "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C";
pub(super) const GOLDEN_APP_ID: &str = "wx5823bf96d3bd56c7";
/// 官方算例口径的随机要素固定值（签名链路复算用）。
pub(super) const GOLDEN_TIMESTAMP: &str = "1648714429";
pub(super) const GOLDEN_NONCE: &str = "0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d";

// ---- 配置构造 ----

pub(super) fn miniapp_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Xiaohongshu {
        url,
        system: XiaohongshuSystem::Miniapp,
        token: GOLDEN_TOKEN.into(),
        encoding_aes_key: GOLDEN_ENCODING_AES_KEY.into(),
        app_id: GOLDEN_APP_ID.into(),
    }
}

pub(super) fn ark_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Xiaohongshu {
        url,
        system: XiaohongshuSystem::Ark,
        token: String::new(),
        encoding_aes_key: String::new(),
        app_id: String::new(),
    }
}

/// quick 客户端别名（网络基建在 crate::test_support 共享）。
pub(super) fn client() -> reqwest::blocking::Client {
    quick_client(std::time::Duration::from_secs(2))
}
