//! 平台连接域：本地持久化 + 各渠道协议握手的 Tauri 命令。

pub mod douyin;
pub mod store;
pub mod wecom;

use serde::{Deserialize, Serialize};
use tauri::Manager;

/// 握手结果：ok + 人类可读原因（前端直接展示），抖音/企微共用。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HandshakeOutcome {
    pub ok: bool,
    pub message: String,
}

/// 平台连接配置：持久化（store）与协议握手（douyin/wecom）共用的域类型。
/// 按渠道存不同凭据形状，以 channel 内标序列化（旧版抖音数据形状不变）。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "channel")]
pub enum ConnectionConfig {
    #[serde(rename = "douyin", rename_all = "camelCase")]
    Douyin {
        url: String,
        client_key: String,
        client_secret: String,
    },
    #[serde(rename = "wecom", rename_all = "camelCase")]
    Wecom {
        url: String,
        corp_id: String,
        token: String,
        encoding_aes_key: String,
        agent_id: String,
    },
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map_err(|err| err.to_string())
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

/// 按抖音 verify_webhook 协议测试连接（challenge 握手）。
/// 网络等待放到阻塞线程池，避免卡住主线程。
#[tauri::command]
pub async fn connections_test_douyin(config: ConnectionConfig) -> Result<HandshakeOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        douyin::verify_handshake(&douyin::handshake_client(), &config)
    })
    .await
    .map_err(|err| err.to_string())
}

/// 按企业微信 GET echostr 协议测试连接（官方要求 1 秒内回显解密明文）。
/// 网络等待放到阻塞线程池，避免卡住主线程。
#[tauri::command]
pub async fn connections_test_wecom(config: ConnectionConfig) -> Result<HandshakeOutcome, String> {
    tauri::async_runtime::spawn_blocking(move || {
        wecom::verify_handshake(&wecom::handshake_client(), &config)
    })
    .await
    .map_err(|err| err.to_string())
}
