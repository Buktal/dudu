//! 期望回执的数据类型（按职责自 verdict.rs 拆出）：期望结构与正文形态枚举。
//! 判定内核与展示辅助分见父模块与 [`super::display`]。

use serde::{Deserialize, Serialize};

/// 正文形态枚举单点在 events（持久化契约所在域，装载遇未知取值触发
/// store_io 隔离自愈、保存端枚举只写已知值）。
pub use crate::events::ReceiptBodyMode;

/// 步骤期望（快照物化/直发请求由前端从事件版本或草稿带出）。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExpectedReceipt {
    pub status: u16,
    /// 期望正文（空 = 不校验正文只看状态码；三种 reply 形态除外——
    /// 空正文仍校验回包形态本身，白名单见父模块 compare_body）
    pub body: String,
    pub body_mode: ReceiptBodyMode,
}
