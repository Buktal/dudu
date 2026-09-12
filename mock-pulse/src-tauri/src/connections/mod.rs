//! 平台连接域：本地持久化 + 抖音 verify_webhook 握手的 Tauri 命令。

pub mod douyin;
pub mod store;

use douyin::HandshakeOutcome;
use serde::{Deserialize, Serialize};
use tauri::Manager;

/// 平台连接配置：持久化（store）与协议握手（douyin）共用的域类型。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub channel: String,
    pub url: String,
    pub client_key: String,
    pub client_secret: String,
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
    list.retain(|item| item.channel != config.channel);
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
