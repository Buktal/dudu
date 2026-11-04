//! 小红书渠道测试公共体：官方样本常量（事实库 xiaohongshu.md + 三方私信
//! spec 逐字）+ 配置构造 + 网络基建复用。
//! 按职责拆分：[`golden`] 黄金样本 → AES（官方 MsgDecrypt 算法）→ sha1 验签
//! 链路（无需网络）、[`chain`] 握手与三通道直发全链路（本地 TcpListener）。

mod chain;
mod golden;

use crate::connections::ConnectionConfig;
use crate::test_support::quick_client;

use super::*;

// ---- 官方样本常量（事实库 §10.3/§11.3 + spec §1.4，逐字） ----

/// 小程序客服消息官方样本（§10.3 逐字）：紧凑单行 = 直发/加密的线上形态。
pub(super) const GOLDEN_MESSAGE_PLAINTEXT: &str = r#"{"MsgId":"MSG_ID","FromOpenId":"USER_OPEN_ID","ToAppId":"SELLER_APP_ID","MsgType":"text","CreateTime":1648714429,"Content":"..."}"#;

/// ark 官方构造示例（§5.4 逐字，紧凑单行 = 数组包裹前的线上形态）。
pub(super) const GOLDEN_ARK_ENVELOPE: &str = r#"{"msgTag":"msg_fulfillment_status_change","sellerId":"5e8e****","data":"{\"orderId\":\"P01****\",\"updateTime\":1693500000,\"orderStatus\":4}"}"#;

/// 三方线索推送黄金样本（spec §1.4 字段表 + 联调代码信封形态；紧凑单行 =
/// 直发的线上形态，与前端 third.ts GOLDEN_LEAD 同源同值）。
pub(super) const GOLDEN_THIRD_LEAD: &str = r#"{"data":{"landing_page_id":881,"url":"https://www.xiaohongshu.com/note/01****","submitted_time":"2024-07-24 10:00:00","source_channel":"search","account_id":"ACCOUNT_ID","account_name":"MERCHANT_ACCOUNT_NAME","campaign_id":201,"campaign_name":"CAMPAIGN_NAME","unit_id":301,"unit_name":"UNIT_NAME","creative_id":401,"leads_id":"LEADS_ID","keyword":"KEYWORD","data":[{"label":"电话号码","value":"138****0000"},{"label":"用户昵称","value":"USER_NICK_NAME"}]},"timestamp":1721796000000,"source":"xx"}"#;

/// 测试用连接凭据（官方无黄金算例，固定值供独立复算对拍）。
pub(super) const GOLDEN_TOKEN: &str = "xhsTestToken";
pub(super) const GOLDEN_ENCODING_AES_KEY: &str = "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C";
pub(super) const GOLDEN_APP_ID: &str = "wx5823bf96d3bd56c7";
/// 三方面推送验签 Token（spec §1.2；固定值供 HMAC 复算对拍）。
pub(super) const GOLDEN_PUSH_TOKEN: &str = "xhsPushToken";
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
        push_token: String::new(),
    }
}

pub(super) fn ark_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Xiaohongshu {
        url,
        system: XiaohongshuSystem::Ark,
        token: String::new(),
        encoding_aes_key: String::new(),
        app_id: String::new(),
        push_token: String::new(),
    }
}

pub(super) fn third_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Xiaohongshu {
        url,
        system: XiaohongshuSystem::Third,
        token: String::new(),
        encoding_aes_key: String::new(),
        app_id: String::new(),
        push_token: GOLDEN_PUSH_TOKEN.into(),
    }
}

/// quick 客户端别名（网络基建在 crate::test_support 共享）。
pub(super) fn client() -> reqwest::blocking::Client {
    quick_client(std::time::Duration::from_secs(2))
}
