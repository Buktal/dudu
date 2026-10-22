//! 平台连接域：本地持久化 + 各渠道协议握手的 Tauri 命令。
//! [`ChannelAdapter`] 是「渠道字符串/连接配置 → 协议原语」的唯一路由 seam：
//! 执行器单步执行（runs::executor）、直发分派（sends）、连接测试（本模块命令）
//! 全部经注册表查表，不再各自手写渠道路由；各渠道的载荷/验签/加密差异
//! 留在 adapter 实现内部（ADR-0001）。
//!
//! 域内分层：[`adapter`]（trait + 静态注册表 + 宽→窄收窄单点 narrow!）/
//! [`net`]（客户端构造、直发测量收口、握手应答判定骨架）/ 渠道实现模块
//! （协议差异本体）/ 本体（结果契约 + Tauri 命令）。根路径 `super::` 保持
//! 既有 `crate::connections::X` 消费面（sends、runs 与各渠道 import）不变。

mod adapter;
mod config;
mod net;
pub mod alipay;
pub mod bilibili;
pub mod dingtalk;
pub mod douyin;
pub mod eleme;
pub mod feishu;
pub mod jingdong;
pub mod kuaishou;
pub mod meituan;
pub mod pinduoduo;
pub mod qq;
pub mod store;
pub mod taobao;
pub mod telegram;
pub(crate) mod util;
pub(crate) mod wechat_common;
pub mod wechat_mini;
pub mod wechat_mp;
pub mod weibo;
pub mod wecom;
pub mod whatsapp;
pub mod xiaohongshu;

use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::app_data_dir;

// 体系/通道/模式枚举按 connections:: 路径对外复用（部分仅子模块测试消费）
#[allow(unused_imports)]
pub use config::{
    ConnectionConfig, DingtalkSystem, DouyinSystem, WechatMiniDataFormat,
    WechatMiniMode, WechatMpMode, WecomSystem, XiaohongshuSystem,
};

// 适配器 seam 与网络骨架按既有 super:: 路径供给渠道与 crate 内消费方
// （ADAPTERS 仅注册表覆盖测试消费）
#[allow(unused_imports)]
pub(crate) use adapter::{adapter_by_channel, adapter_of, ADAPTERS, ChannelAdapter};
#[allow(unused_imports)]
pub(crate) use net::{
    client_with_timeout, dispatch_client, handshake_echo_get, handshake_echo_outcome,
    no_body_check, no_reply, probe_handshake_outcome, request_error_reason,
    send_measured_outcome, DispatchSnapshot,
};

/// 握手结果：ok + 人类可读原因（前端直接展示），抖音/企微共用。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HandshakeOutcome {
    pub ok: bool,
    pub message: String,
}

/// 渠道直发的统一结果：协议要素快照 + 回执事实，抖音/企微共用同一结构。
/// 企微特有要素（加密信封/时间戳/解密被动回复）以 Option 承载，抖音恒 None；
/// 差异只在各 adapter 构造结果时体现，消费方（runs/sends）不感知渠道。
/// status 0 = 未收到响应（超时/连接失败，原因在 error）。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DispatchOutcome {
    /// 发送唯一标识快照：抖音 Msg-Id 头 / 企微 nonce
    pub msg_id: String,
    /// 签名快照：抖音 X-Douyin-Signature 头 / 企微 msg_signature 查询参数
    pub signature: String,
    /// 企微 msg_signature 的时间戳（抖音/未发出请求为 None）
    pub timestamp: Option<String>,
    /// 实际发出的请求快照：抖音与明文逐字节一致 / 企微为加密信封（未发出为 None）
    pub request_body: Option<String>,
    /// 企微加密被动回复解密后的明文（抖音/目标未回加密包为 None）
    pub reply: Option<String>,
    pub status: u16,
    pub elapsed_ms: u64,
    pub body: String,
    pub error: Option<String>,
}

impl DispatchOutcome {
    /// 未发出请求的结果（连接缺失/未知渠道/用户停止）：
    /// 协议要素不落值，零回执 + 失败原因。
    pub fn not_sent(error: impl Into<String>) -> Self {
        Self {
            msg_id: String::new(),
            signature: String::new(),
            timestamp: None,
            request_body: None,
            reply: None,
            status: 0,
            elapsed_ms: 0,
            body: String::new(),
            error: Some(error.into()),
        }
    }
}

/// 读取全部持久化连接（无文件时返回空列表）。
#[tauri::command]
pub fn connections_load(app: tauri::AppHandle) -> Result<Vec<ConnectionConfig>, String> {
    let dir = app_data_dir(&app)?;
    store::load_connections(&dir).map_err(|err| err.to_string())
}

/// 保存单条连接（按 channel 覆盖），返回保存后的完整列表。
#[tauri::command]
pub fn connections_save(
    app: tauri::AppHandle,
    config: ConnectionConfig,
) -> Result<Vec<ConnectionConfig>, String> {
    // load→retain→push→save 全程串行（与 runs::store::upsert_run 同一纪律，
    // 不依赖「同步命令主线程串行」的隐式假设）
    static WRITES: Mutex<()> = Mutex::new(());
    let _write = WRITES.lock().unwrap_or_else(|error| error.into_inner());
    let dir = app_data_dir(&app)?;
    let mut list = store::load_connections(&dir).map_err(|err| err.to_string())?;
    let variant = std::mem::discriminant(&config);
    list.retain(|item| std::mem::discriminant(item) != variant);
    list.push(config);
    store::save_connections(&dir, &list).map_err(|err| err.to_string())?;
    Ok(list)
}

/// 连接测试公共体：渠道差异（握手协议、超时上限）全部经 adapter 取用；
/// 网络等待放到阻塞线程池，避免卡住主线程。
async fn run_handshake(
    adapter: &'static dyn ChannelAdapter,
    config: ConnectionConfig,
) -> Result<HandshakeOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        adapter.verify_handshake(&adapter.handshake_client(), &config)
    })
    .await
    .map_err(|err| err.to_string())
}

/// 按连接配置测试连接（全渠道唯一握手入口）：渠道差异（握手协议、
/// 超时上限）全部经适配器注册表取用，调用方不再按渠道分支；
/// 未知渠道在 IPC 参数反序列化即被拒绝，不会到达本函数。
/// 各渠道握手/探针形态锚定事实库（docs/research/channels/）：
/// 抖音 dop/生活服务 challenge、小游戏 verify_request、服务商授权推送；
/// 企微/公众号/小程序/微博 GET echostr；飞书 POST url_verification；
/// 钉钉密文 check_url / 机器人 HmacSHA256 探测；QQ op13 回调；
/// 小红书小程序握手 / ark 探针；快手 TEST 事件；淘宝全球栈 Verify；
/// 京东/拼多多/美团/饿了么/支付宝推送探针；B站 verify_webhooks；
/// WhatsApp GET 三参握手；Telegram Update 推送探针。
/// 网络等待放到阻塞线程池，避免卡住主线程。
#[tauri::command]
pub async fn connections_test(config: ConnectionConfig) -> Result<HandshakeOutcome, String> {
    run_handshake(adapter_of(&config), config).await
}

#[cfg(test)]
mod tests;
