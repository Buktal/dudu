//! 平台连接域：本地持久化 + 各渠道协议握手的 Tauri 命令。
//! [`ChannelAdapter`] 是「渠道字符串/连接配置 → 协议原语」的唯一路由 seam：
//! 执行器单步执行（runs::executor）、直发分派（sends）、连接测试（本模块命令）
//! 全部经注册表查表，不再各自手写渠道路由；各渠道的载荷/验签/加密差异
//! 留在 adapter 实现内部（ADR-0001）。

pub mod douyin;
pub mod store;
pub(crate) mod util;
pub mod wecom;

use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::app_data_dir;

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
pub(crate) static ADAPTERS: &[&dyn ChannelAdapter] = &[&douyin::Adapter, &wecom::Adapter];

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

/// 抖音推送体系（事实库 §2：四套并行推送体系，验签与载荷完全不同）。
/// 连接配置按体系路由协议原语；序列化 snake_case，缺省 dop（旧版数据形状不变）。
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DouyinSystem {
    /// dop Webhooks：移动/网站应用 + IM 私信，X-Douyin-Signature = sha1(client_secret + body)
    #[default]
    Dop,
    /// 生活服务 WebHooks：X-Douyin-Signature = sha1(AppSecret + 去换行 body)，2.5 秒应答窗口
    LifeService,
    /// 小游戏消息推送：x-signature = base64(md5(排序四头 + body + token))
    MiniGame,
    /// 服务商（第三方小程序）：{Nonce, TimeStamp, Encrypt, MsgSignature} 信封
    Isv,
}

/// 企微推送通道（事实库 §2.1/§2.10：XML 自建应用与 JSON 智能机器人两通道并行）。
/// 连接配置按通道路由协议原语；序列化 snake_case，缺省 agent（旧版数据形状不变）。
#[derive(Serialize, Deserialize, Clone, Copy, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WecomSystem {
    /// 自建应用回调：明文 XML 报文，加密 receiveid = corpId（官方 90239/90240）
    #[default]
    Agent,
    /// 智能机器人回调：明文 JSON 报文，加密 receiveid = 空串（官方 100719/101027/101033）
    Aibot,
}

/// 平台连接配置：持久化（store）与协议握手（douyin/wecom）共用的域类型。
/// 按渠道存不同凭据形状，以 channel 内标序列化（旧版抖音/企微数据形状不变，
/// 新增体系/通道字段全部 serde default 缺省）。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "channel")]
pub enum ConnectionConfig {
    #[serde(rename = "douyin", rename_all = "camelCase")]
    Douyin {
        url: String,
        /// 推送体系：决定握手与直发的验签/信封协议（缺省 dop）
        #[serde(default)]
        system: DouyinSystem,
        /// 应用标识：dop/生活服务 client_key；小游戏 AppID（x-appid 头）
        client_key: String,
        /// 签名密钥：dop client_secret / 生活服务 AppSecret
        client_secret: String,
        /// 小游戏消息推送 Token（官方配置项，3~32 字符，参与 x-signature）
        #[serde(default)]
        mini_game_token: String,
        /// 服务商 消息验证 TOKEN（参与 MsgSignature）
        #[serde(default)]
        isv_token: String,
        /// 服务商 消息加密解密 KEY（官方 AES 参数待核验(09-27)，暂随配置保存）
        #[serde(default)]
        isv_key: String,
    },
    #[serde(rename = "wecom", rename_all = "camelCase")]
    Wecom {
        url: String,
        /// 推送通道：自建应用 XML / 智能机器人 JSON（缺省 agent）
        #[serde(default)]
        system: WecomSystem,
        /// 企业 CorpID（自建应用通道的加密 receiveid；机器人通道 receiveid 为空）
        corp_id: String,
        /// 回调配置 Token（两通道共用，参与四值签名）
        token: String,
        /// 43 位 EncodingAESKey（两通道共用，AES-256-CBC 派生源）
        encoding_aes_key: String,
        /// 自建应用数字 ID（仅应用相关回调信封携带）
        agent_id: String,
    },
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dispatch_outcome_serializes_camel_case_for_frontend() {
        let outcome = DispatchOutcome {
            msg_id: "1372623149".into(),
            signature: "a".repeat(40),
            timestamp: Some("1409659813".into()),
            request_body: Some("<xml/>".into()),
            reply: Some("<xml/>".into()),
            status: 200,
            elapsed_ms: 9,
            body: "success".into(),
            error: None,
        };
        let raw = serde_json::to_string(&outcome).unwrap();
        assert!(raw.contains("\"elapsedMs\""));
        assert!(raw.contains("\"reply\""));
        assert!(!raw.contains("elapsed_ms"));
    }

    #[test]
    fn not_sent_outcome_carries_zero_receipt_and_reason() {
        let outcome = DispatchOutcome::not_sent("缺少渠道连接配置");
        assert_eq!(outcome.status, 0);
        assert_eq!(outcome.error.as_deref(), Some("缺少渠道连接配置"));
        // 协议要素不落值：未发出请求就没有签名/唯一标识/请求快照
        assert_eq!(outcome.signature, "");
        assert_eq!(outcome.msg_id, "");
        assert_eq!(outcome.request_body, None);
        assert_eq!(outcome.timestamp, None);
        assert_eq!(outcome.reply, None);
    }

    #[test]
    fn adapter_registry_covers_every_config_variant() {
        let douyin_config = ConnectionConfig::Douyin {
            url: String::new(),
            system: DouyinSystem::Dop,
            client_key: String::new(),
            client_secret: String::new(),
            mini_game_token: String::new(),
            isv_token: String::new(),
            isv_key: String::new(),
        };
        let wecom_config = ConnectionConfig::Wecom {
            url: String::new(),
            system: WecomSystem::Agent,
            corp_id: String::new(),
            token: String::new(),
            encoding_aes_key: String::new(),
            agent_id: String::new(),
        };
        assert_eq!(adapter_of(&douyin_config).id(), "douyin");
        assert_eq!(adapter_of(&wecom_config).id(), "wecom");
        assert_eq!(
            adapter_by_channel("douyin").map(|adapter| adapter.id()),
            Some("douyin")
        );
        assert_eq!(
            adapter_by_channel("wecom").map(|adapter| adapter.id()),
            Some("wecom")
        );
        assert!(adapter_by_channel("telegram").is_none());
        // 渠道串与配置判别互为映照：url 快照只对匹配的配置成立
        for adapter in ADAPTERS {
            assert_eq!(
                adapter.url(&douyin_config).is_some(),
                adapter.matches(&douyin_config)
            );
            assert_eq!(
                adapter.url(&wecom_config).is_some(),
                adapter.matches(&wecom_config)
            );
        }
    }
}
