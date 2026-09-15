//! WhatsApp 渠道测试公共体：官方样本常量（事实库 whatsapp.md §4.1/§5.1/§5.2
//! 逐字）+ 配置构造 + 网络基建复用（crate::test_support 单请求监听）。
//! 按职责拆分：[`golden`] 验签黄金向量与信封形态（无需网络）、
//! [`chain`] 握手与直发全链路（本地 TcpListener）。

mod chain;
mod golden;

use crate::connections::ConnectionConfig;
use crate::test_support::quick_client;

use super::*;

// ---- 官方样本常量（事实库逐字） ----

/// 测试 AppSecret（官方未给样例密钥原文，签名回归向量取 Node crypto 交叉复算）。
pub(super) const GOLDEN_APP_SECRET: &str = "whatsapp_app_secret";
/// 测试 Verify Token（官方为自选任意字符串，与 App Secret 是两个无关值）。
pub(super) const GOLDEN_VERIFY_TOKEN: &str = "meaty-hammer-7";

/// §5.1 入站文本核验样本明文（键序同官方文档，wamid 尾部带 "="）。
pub(super) const GOLDEN_INBOUND_PLAINTEXT: &str = concat!(
    r#"{"object":"whatsapp_business_account","entry":[{"id":"102290129340398","#,
    r#""changes":[{"value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"15550783881","#,
    r#""phone_number_id":"106540352242922"},"contacts":[{"profile":{"name":"Sheena Nelson"},"wa_id":"16505551234"}],"#,
    r#""messages":[{"from":"16505551234","id":"wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=","#,
    r#""timestamp":"1749416383","type":"text","text":{"body":"Does it come in another color?"}}]},"field":"messages"}]}]}"#
);

/// §5.2 delivered 状态核验样本明文（键序同官方文档，conversation + pricing）。
pub(super) const GOLDEN_DELIVERED_PLAINTEXT: &str = concat!(
    r#"{"object":"whatsapp_business_account","entry":[{"id":"102290129340398","#,
    r#""changes":[{"value":{"messaging_product":"whatsapp","metadata":{"display_phone_number":"15550783881","#,
    r#""phone_number_id":"106540352242922"},"statuses":[{"id":"wamid.HBgLMTY1MDM4Nzk0MzkVAgARGBI3MTE5MjVBOTE3MDk5QUVFM0YA","#,
    r#""status":"delivered","timestamp":"1750263773","recipient_id":"16505551234","#,
    r#""conversation":{"id":"6ceb9d929c9bdc4f90e967a32f8639b4","origin":{"type":"service"}},"#,
    r#""pricing":{"billable":true,"pricing_model":"CBP","category":"service"}}]},"field":"messages"}]}]}"#
);

/// 官方样本业务幂等键（wamid 三处同源，§附速查）。
pub(super) const GOLDEN_INBOUND_WAMID: &str =
    "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=";
pub(super) const GOLDEN_DELIVERED_WAMID: &str =
    "wamid.HBgLMTY1MDM4Nzk0MzkVAgARGBI3MTE5MjVBOTE3MDk5QUVFM0YA";

/// 官方 §4.1 示例 hash 仅给截断形态（b63bb3…0b1f7d2），无法作对拍回归向量
/// （回归向量见 golden.rs 的 Node 交叉复算与通行示例向量）。
pub(super) const NODE_INBOUND_SIGNATURE: &str =
    "sha256=d7cb4e2edfe5a785613849eeccb385976ef6e07b1032943a1a5fd785b13c28c3";
pub(super) const NODE_DELIVERED_SIGNATURE: &str =
    "sha256=67e0bee9f9d8d0d9d0f39be405c8bd29f16b38800222be27150fe5e6b094833a";
/// HMAC-SHA256 通行示例向量（key="key"、data="The quick brown fox jumps over
/// the lazy dog"，Node crypto 交叉复算；util 层已锚定，此处锚定组合层形态）。
pub(super) const KNOWN_FOX_DIGEST: &str =
    "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8";

pub(super) fn whatsapp_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Whatsapp {
        url,
        app_secret: GOLDEN_APP_SECRET.into(),
        verify_token: GOLDEN_VERIFY_TOKEN.into(),
    }
}

/// quick 客户端别名（网络基建在 crate::test_support 共享）。
pub(super) fn client() -> reqwest::blocking::Client {
    quick_client(std::time::Duration::from_secs(2))
}
