//! 平台连接域：本地持久化 + 各渠道协议握手的 Tauri 命令。
//! [`ChannelAdapter`] 是「渠道字符串/连接配置 → 协议原语」的唯一路由 seam：
//! 执行器单步执行（runs::executor）、直发分派（sends）、连接测试（本模块命令）
//! 全部经注册表查表，不再各自手写渠道路由；各渠道的载荷/验签/加密差异
//! 留在 adapter 实现内部（ADR-0001）。

mod config;
pub mod dingtalk;
pub mod douyin;
pub mod feishu;
pub mod kuaishou;
pub mod qq;
pub mod store;
pub mod taobao;
pub(crate) mod util;
pub mod wechat_mini;
pub mod wechat_mp;
pub mod weibo;
pub mod wecom;
pub mod xiaohongshu;

use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::app_data_dir;

// 体系/通道/模式枚举按 connections:: 路径对外复用（部分仅子模块测试消费）
#[allow(unused_imports)]
pub use config::{
    ConnectionConfig, DingtalkSystem, DouyinSystem, WechatMiniDataFormat,
    WechatMiniMode, WechatMpMode, WecomSystem, XiaohongshuSystem,
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

/// 渠道适配器：渠道身份/配置判别 → 协议原语的最小方法集。
/// 只统一各渠道已自发收敛的共性签名（握手、分派、超时客户端、url 快照），
/// 不触碰载荷格式——高保真差异留在实现内部（ADR-0001）。
/// 适配器无状态（单元结构体），Send + Sync 便于静态注册表与阻塞线程池取用。
pub(crate) trait ChannelAdapter: Send + Sync {
    /// 渠道标识（与 ConnectionConfig 序列化的 channel 内标、RunStep.channel 一致）
    fn id(&self) -> &'static str;
    /// 渠道显示名（错误文案：抖音 / 企业微信）
    fn label(&self) -> &'static str;
    /// 配置判别：该连接配置是否属于本渠道
    fn matches(&self, config: &ConnectionConfig) -> bool;
    /// 发送目标地址快照（配置不属于本渠道时 None）
    fn url<'a>(&self, config: &'a ConnectionConfig) -> Option<&'a str>;
    /// 连接测试客户端：超时上限渠道自持（企微官方要求 1 秒内应答，抖音 5 秒）
    fn handshake_client(&self) -> reqwest::blocking::Client;
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
    &douyin::Adapter,
    &wecom::Adapter,
    &wechat_mp::Adapter,
    &wechat_mini::Adapter,
    &feishu::Adapter,
    &dingtalk::Adapter,
    &qq::Adapter,
    &weibo::Adapter,
    &xiaohongshu::Adapter,
    &kuaishou::Adapter,
    &taobao::Adapter,
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

/// 指定超时的客户端（各渠道握手/直发、执行器与测试共用同一构造，不复制协议）。
pub(crate) fn client_with_timeout(timeout: Duration) -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .timeout(timeout)
        .build()
        .expect("构造 reqwest 客户端失败")
}

/// 直发用默认客户端：对齐官方 5 秒应答窗口，本地留 5s 上限。
pub(crate) fn dispatch_client() -> reqwest::blocking::Client {
    client_with_timeout(Duration::from_secs(5))
}

/// reqwest 错误分类 → 人类可读原因（单点，各渠道握手/直发现场共用同一文案）：
/// 超时 / 连接失败 / 其他发送失败；超时可附渠道补充（如官方应答窗口）。
pub(crate) fn request_error_reason(err: &reqwest::Error, timeout_note: &str) -> String {
    if err.is_timeout() {
        format!("等待响应超时{timeout_note}")
    } else if err.is_connect() {
        "无法连接到目标地址".to_string()
    } else {
        "请求发送失败".to_string()
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

/// 按抖音连接配置的推送体系测试连接：dop/生活服务 verify_webhook challenge 握手、
/// 小游戏 verify_request x-signature 握手、服务商授权推送（回 success）。
#[tauri::command]
pub async fn connections_test_douyin(config: ConnectionConfig) -> Result<HandshakeOutcome, String> {
    run_handshake(&douyin::Adapter, config).await
}

/// 按企业微信 GET echostr 协议测试连接（官方要求 1 秒内回显解密明文）。
#[tauri::command]
pub async fn connections_test_wecom(config: ConnectionConfig) -> Result<HandshakeOutcome, String> {
    run_handshake(&wecom::Adapter, config).await
}

/// 按公众号 GET 三参握手协议测试连接（signature=sha1(字典序排序三参)，
/// 目标原样回显 echostr；官方 5 秒应答窗口）。
#[tauri::command]
pub async fn connections_test_wechat_mp(
    config: ConnectionConfig,
) -> Result<HandshakeOutcome, String> {
    run_handshake(&wechat_mp::Adapter, config).await
}

/// 按小程序 GET 三参握手协议测试连接（与公众号同族：signature=sha1(字典序
/// 排序三参)，目标原样回显 echostr；官方 5 秒应答窗口）。
#[tauri::command]
pub async fn connections_test_wechat_mini(
    config: ConnectionConfig,
) -> Result<HandshakeOutcome, String> {
    run_handshake(&wechat_mini::Adapter, config).await
}

/// 按飞书 POST url_verification 协议测试连接（官方要求 1 秒内回显
/// challenge；配 Encrypt Key 时发加密信封 + X-Lark-Signature 签名）。
#[tauri::command]
pub async fn connections_test_feishu(config: ConnectionConfig) -> Result<HandshakeOutcome, String> {
    run_handshake(&feishu::Adapter, config).await
}

/// 按钉钉通道测试连接：密文通道发 check_url 握手（1500ms 内期望加密 success
/// 回包）；机器人通道发 timestamp/sign（HmacSHA256）签名的明文探测。
#[tauri::command]
pub async fn connections_test_dingtalk(
    config: ConnectionConfig,
) -> Result<HandshakeOutcome, String> {
    run_handshake(&dingtalk::Adapter, config).await
}

/// 按 QQ op13 验证回调协议测试连接（目标须回 plain_token 回显 + Ed25519
/// 签名回包；官方未给应答时限口径）。
#[tauri::command]
pub async fn connections_test_qq(config: ConnectionConfig) -> Result<HandshakeOutcome, String> {
    run_handshake(&qq::Adapter, config).await
}

/// 按微博 GET 四参握手协议测试连接（signature=sha1(字典序排序三参)，
/// 目标原样回显 echostr；官方 5 秒应答窗口，超时断开×3 重试）。
#[tauri::command]
pub async fn connections_test_weibo(
    config: ConnectionConfig,
) -> Result<HandshakeOutcome, String> {
    run_handshake(&weibo::Adapter, config).await
}

/// 按小红书通道测试连接：小程序通道发 GET 四参握手（三参 sha1 签名，目标
/// 原样回显 echostr）；ark 通道发最小推送探针（官方数组形态，期望
/// {"success":true,"error_code":0}；电商侧无官方握手口径）。
#[tauri::command]
pub async fn connections_test_xiaohongshu(
    config: ConnectionConfig,
) -> Result<HandshakeOutcome, String> {
    run_handshake(&xiaohongshu::Adapter, config).await
}

/// 按快手 TEST 事件协议测试连接（官方配地址握手：POST TEST 事件 + header
/// kwaisign = MD5(body+AppSecret)，目标须回 200 + result=1 并回传 message_id）。
#[tauri::command]
pub async fn connections_test_kuaishou(
    config: ConnectionConfig,
) -> Result<HandshakeOutcome, String> {
    run_handshake(&kuaishou::Adapter, config).await
}

/// 按全球栈 Verify 协议测试连接（官方配置页：填回调地址后 Verify，返回
/// HTTP 200 即验证成功；探针带 Authorization = HEX(HMAC-SHA256(AppKey+body,
/// AppSecret)) 签名头，事实库 §3.2/§4.2）。
#[tauri::command]
pub async fn connections_test_taobao(
    config: ConnectionConfig,
) -> Result<HandshakeOutcome, String> {
    run_handshake(&taobao::Adapter, config).await
}

#[cfg(test)]
mod tests;
