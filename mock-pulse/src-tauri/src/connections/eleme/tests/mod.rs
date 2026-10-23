//! 饿了么渠道测试公共体：官方样本常量（事实库 eleme.md §4.1/§5.1/§5.2 逐字）
//! + 配置构造 + 网络基建复用（crate::test_support 单请求监听）。
//! 按职责拆分：[`golden`] 官方示例待签串五步对拍与签名原语语义（无需网络）、
//! [`chain`] 探针握手与直发全链路（本地 TcpListener）。

mod chain;
mod golden;

use crate::connections::ConnectionConfig;
use crate::test_support::quick_client;

use super::*;

// ---- 官方样本常量（事实库逐字） ----

/// 官方 §4.1 快速入门签名示例（#gen-sig 步骤 1/2/4 逐字）：示例待签串的
/// 请求 url 部分（官方「计算 sig 时 URL 末尾必须带 /」——示例即带尾斜杠）。
pub(super) const GOLDEN_URL: &str = "http://openapi.ele.me/v2/restaurants/";

/// 官方 §4.1 步骤 1 示例排序串的参数值逐字。
pub(super) const GOLDEN_REQUEST_PARAMS: [(&str, &str); 2] =
    [("consumer_key", "7284397484"), ("timestamp", "1374908054")];

/// 官方 §4.1 步骤 2 示例待签串内嵌的 consumer_secret（`…1374908054` 与
/// `4d31ba58…` 视觉连写，即 secret 无缝尾拼形态）。
pub(super) const GOLDEN_SECRET: &str = "4d31ba58fd73c71db697ab5e4946d52d";

/// 官方 §4.1 步骤 2 示例待签串逐字（url + ? + 字母序 k=v & 连接 + secret
/// 无缝尾拼）。
pub(super) const GOLDEN_SIGN_CONCAT: &str = "http://openapi.ele.me/v2/restaurants/?consumer_key=7284397484&timestamp=13749080544d31ba58fd73c71db697ab5e4946d52d";

/// 官方 §4.1 示例串五步复算结果（Node crypto 交叉复算锚定）：官方步骤 4
/// 示例值 e76dfee… 为示意值、与示例待签串对不上（真实 secret 未公开），
/// 照录该不自洽、不以示意值作对拍，见 tests/golden.rs。
pub(super) const GOLDEN_SIGN: &str = "97d1e8e48ab103efa512d0588df7a18aa822ecc3";

/// H5 表单推送业务字段样本（§5.6 字段表五字段；官方未给载荷样本，值取
/// 事实库同源：order_id 同族、new_status 取枚举，见 schemas 骨架说明）：
/// 直发样本同源，msg_id 快照取 order_id。
pub(super) const GOLDEN_H5_FORM: &str =
    "push_action=2&order_id=12637645858619059&user_id=12345&new_status=2&user_state=USER_STATE";

pub(super) fn eleme_config(url: String) -> ConnectionConfig {
    ConnectionConfig::Eleme {
        url,
        consumer_key: "7284397484".into(),
        consumer_secret: GOLDEN_SECRET.into(),
    }
}

/// quick 客户端别名（网络基建在 crate::test_support 共享）。
pub(super) fn client() -> reqwest::blocking::Client {
    quick_client(std::time::Duration::from_secs(2))
}
