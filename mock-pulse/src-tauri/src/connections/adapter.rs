//! 渠道适配器 seam：[`ChannelAdapter`] trait（渠道身份/配置判别 → 协议原语的
//! 最小方法集）+ 静态注册表 [`ADAPTERS`]（全仓唯一的渠道路由点，新渠道在此
//! 登记一行）。各渠道的载荷/验签/加密差异留在 adapter 实现内部（ADR-0001）；
//! 网络/测量/握手骨架见 `super::net`，命令层见 `super`。

use std::time::Duration;

use super::net::client_with_timeout;
use super::{ConnectionConfig, DispatchOutcome, HandshakeOutcome};

/// 宽→窄收窄单点（connections 域唯一的 downcast 语法）：适配器 trait 方法收到
/// 的连接配置经 [`ADAPTERS`] 按 `matches()` 路由，必为本渠道变体，本宏把宽
/// [`ConnectionConfig`] 就地解构为所需字段直接取用；错配即编程错误，以
/// [`unreachable!`] 终止——不保留「返回错误文案」的伪防御分支。
macro_rules! narrow {
    ($config:expr, $variant:ident { $($field:ident),+ $(,)? } => $body:expr) => {
        match $config {
            $crate::connections::ConnectionConfig::$variant { $($field),+, .. } => $body,
            _ => unreachable!("ADAPTERS 已按 matches() 路由，配置必为本渠道变体"),
        }
    };
}

pub(crate) use narrow;

/// 渠道适配器：渠道身份/配置判别 → 协议原语的最小方法集。
/// 只统一各渠道已自发收敛的共性签名（握手、分派、超时客户端、url 快照），
/// 不触碰载荷格式——高保真差异留在实现内部（ADR-0001）。
/// 适配器无状态（单元结构体），Send + Sync 便于静态注册表与阻塞线程池取用。
/// 宽配置 → 渠道字段的收窄统一经 [`narrow!`] 完成（本文件单点）。
pub(crate) trait ChannelAdapter: Send + Sync {
    /// 渠道标识（与 ConnectionConfig 序列化的 channel 内标、RunStep.channel 一致）
    fn id(&self) -> &'static str;
    /// 渠道显示名（错误文案：抖音 / 企业微信）
    fn label(&self) -> &'static str;
    /// 配置判别：该连接配置是否属于本渠道
    fn matches(&self, config: &ConnectionConfig) -> bool;
    /// 发送目标地址快照：config 必属本渠道（注册表按 matches() 路由保证），
    /// 恒 Some；错配即编程错误（经 [`narrow!`] 以 unreachable! 终止）。
    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str>;
    /// 连接测试客户端：默认本地 5s 上限（16/19 渠道，各自官方窗口口径见各渠道
    /// 实现注释）；官方窗口更紧的渠道覆写——企业微信 1s（echostr 须 1 秒内
    /// 响应）、飞书 1s（challenge 现行口径 1 秒内应答）、钉钉 1500ms（事件应答
    /// 官方窗口）。
    fn handshake_client(&self) -> reqwest::blocking::Client {
        client_with_timeout(Duration::from_secs(5))
    }
    /// 按渠道协议握手（连接测试）
    fn verify_handshake(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
    ) -> HandshakeOutcome;
    /// 按渠道协议直发一条事件（body 为前端逐字节拼装的明文，实现内不重排）
    fn dispatch_event(
        &self,
        client: &reqwest::blocking::Client,
        config: &ConnectionConfig,
        body: &str,
    ) -> DispatchOutcome;
}

/// 渠道适配器注册表：全仓唯一的渠道路由点，新渠道在此登记一行。
pub(crate) static ADAPTERS: &[&dyn ChannelAdapter] = &[
    &super::douyin::Adapter,
    &super::wecom::Adapter,
    &super::wechat_mp::Adapter,
    &super::wechat_mini::Adapter,
    &super::feishu::Adapter,
    &super::dingtalk::Adapter,
    &super::qq::Adapter,
    &super::weibo::Adapter,
    &super::xiaohongshu::Adapter,
    &super::kuaishou::Adapter,
    &super::taobao::Adapter,
    &super::jingdong::Adapter,
    &super::pinduoduo::Adapter,
    &super::meituan::Adapter,
    &super::eleme::Adapter,
    &super::alipay::Adapter,
    &super::bilibili::Adapter,
    &super::whatsapp::Adapter,
    &super::telegram::Adapter,
];

/// 按渠道字符串取适配器（未知渠道 None，由调用方给出「未知渠道」文案）。
pub(crate) fn adapter_by_channel(channel: &str) -> Option<&'static dyn ChannelAdapter> {
    ADAPTERS
        .iter()
        .copied()
        .find(|adapter| adapter.id() == channel)
}

/// 按配置判别取适配器：注册表覆盖全部配置变体，缺失即编程错误。
pub(crate) fn adapter_of(config: &ConnectionConfig) -> &'static dyn ChannelAdapter {
    ADAPTERS
        .iter()
        .copied()
        .find(|adapter| adapter.matches(config))
        .expect("每种连接配置必有渠道适配器")
}
