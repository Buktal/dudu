//! 平台连接域：本地持久化 + 各渠道协议握手的 Tauri 命令。
//! [`ChannelAdapter`] 是「渠道字符串/连接配置 → 协议原语」的唯一路由 seam：
//! 执行器单步执行（runs::executor）、直发分派（sends）、连接测试（本模块命令）
//! 全部经注册表查表，不再各自手写渠道路由；各渠道的载荷/验签/加密差异
//! 留在 adapter 实现内部（ADR-0001）。

mod config;
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

use std::time::{Duration, Instant};

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
    &jingdong::Adapter,
    &pinduoduo::Adapter,
    &meituan::Adapter,
    &eleme::Adapter,
    &alipay::Adapter,
    &bilibili::Adapter,
    &whatsapp::Adapter,
    &telegram::Adapter,
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

/// 直发测量（Reuse-first 审计退件：此收口块曾在 15+ 渠道逐字复制——计时 →
/// 发送 → 状态/回执/错误/耗时四元组）：计时口径、Ok/Err 折叠与错误文案
/// （request_error_reason）单点在本体。纯 REST 渠道消费四元组；携带协议
/// 要素快照的渠道走 [`send_measured_outcome`] 成品收口。
pub(crate) fn send_measured(
    request: reqwest::blocking::RequestBuilder,
    timeout_note: &str,
) -> (u16, String, Option<String>, u64) {
    let started = Instant::now();
    let response = request.send();
    let elapsed_ms = started.elapsed().as_millis() as u64;
    let (status, receipt, error) = match response {
        Ok(response) => {
            let status = response.status().as_u16();
            let receipt = response.text().unwrap_or_default();
            (status, receipt, None)
        }
        Err(err) => (
            0,
            String::new(),
            Some(format!("{}：{err}", request_error_reason(&err, timeout_note))),
        ),
    };
    (status, receipt, error, elapsed_ms)
}

/// 直发的协议要素快照：发出请求前即已确定、Ok/Err 两分支同值的四字段
/// （[`DispatchOutcome`] 的快照半边；测量回执半边由 [`send_measured_outcome`]
/// 装订）。字段语义见 [`DispatchOutcome`] 各字段文档。
pub(crate) struct DispatchSnapshot {
    /// 发送唯一标识快照（无唯一标识头的渠道为空串）
    pub msg_id: String,
    /// 主签名快照（无签名头的明文渠道为空串）
    pub signature: String,
    /// 签名时间戳快照（无时间戳要素的渠道为 None）
    pub timestamp: Option<String>,
    /// 实际发出的请求体快照（超时/连接失败路径同样保留）
    pub request_body: Option<String>,
}

/// 直发成品收口（send_measured 加深一层）：计时与 Ok/Err 折叠之上，把协议
/// 要素快照（两分支同值）与 Ok 分支增量装订成成品 [`DispatchOutcome`]。
/// Err 分支（status 0 / 空正文 / request_error_reason 折叠文案 / reply None）
/// 单点在本体，携带快照字段的渠道不再各自手写双分支组装；`reply` 只在收到
/// 响应时调用（入参状态码 + 回执正文，如加密回包解密），未发出请求恒 None。
pub(crate) fn send_measured_outcome(
    request: reqwest::blocking::RequestBuilder,
    timeout_note: &str,
    snapshot: DispatchSnapshot,
    reply: impl FnOnce(u16, &str) -> Option<String>,
) -> DispatchOutcome {
    let (status, body, error, elapsed_ms) = send_measured(request, timeout_note);
    let reply = if error.is_none() { reply(status, &body) } else { None };
    DispatchOutcome {
        msg_id: snapshot.msg_id,
        signature: snapshot.signature,
        timestamp: snapshot.timestamp,
        request_body: snapshot.request_body,
        reply,
        status,
        elapsed_ms,
        body,
        error,
    }
}

/// GET echostr 握手应答判定骨架（Reuse-first 审计退件：此判定段曾在 5 处
/// 逐字复制——发送失败 → 超时文案；非 2xx → 握手未通过；2xx → 响应体与
/// 期望值逐字节比对）。差异（期望值、超时补充、成功文案、逐字节不符说明）
/// 留在调用侧；whatsapp 变体（非 2xx 文案含 verify_token 说明、不符文案含
/// JSON 信封警示）保留自有判定。
pub(crate) fn handshake_echo_outcome(
    response: Result<reqwest::blocking::Response, reqwest::Error>,
    expected: &[u8],
    timeout_note: &str,
    success_message: &str,
    mismatch_note: &str,
) -> HandshakeOutcome {
    let response = match response {
        Ok(response) => response,
        Err(err) => {
            return HandshakeOutcome {
                ok: false,
                message: format!("{}：{err}", request_error_reason(&err, timeout_note)),
            };
        }
    };

    let status = response.status();
    if !status.is_success() {
        return HandshakeOutcome {
            ok: false,
            message: format!("目标返回 HTTP {status}，echostr 握手未通过"),
        };
    }

    let body = response.bytes().unwrap_or_default();
    if body.as_ref() == expected {
        HandshakeOutcome {
            ok: true,
            message: success_message.to_string(),
        }
    } else {
        let echoed = String::from_utf8_lossy(&body).to_string();
        HandshakeOutcome {
            ok: false,
            message: format!("HTTP 200 但{mismatch_note}：{echoed:?}"),
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
