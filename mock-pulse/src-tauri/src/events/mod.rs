//! 事件素材域：版本化事件的本地持久化 + Tauri 命令。
//! 事件保存 = 追加不可变版本；载荷原样保留未知字段（serde_json::Value 不裁剪）。

pub mod store;

use serde::{Deserialize, Serialize};
use tauri::Manager;

/// 期望回执：状态码 + 正文形态（contains/equals/jsonField）。
/// bodyMode 在 #16 引入，旧数据缺省按 contains 读入。
fn default_body_mode() -> String {
    "contains".to_string()
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ExpectedReceipt {
    pub status: u16,
    pub body: String,
    #[serde(default = "default_body_mode")]
    pub body_mode: String,
}

/// 事件的一个不可变版本：保存时间 + 来源草稿快照。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredVersion {
    pub revision: u64,
    pub saved_at: String,
    /// 完整线上报文（含模板未定义的未知字段，原样保留）。
    /// im_enter_direct_msg 的 content 在线上是 JSON 字符串，按原文存。
    pub payload: serde_json::Value,
    pub expected: ExpectedReceipt,
}

/// 素材库中的一条事件：versions 只追加，旧版本可回看。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredEvent {
    pub id: String,
    pub name: String,
    pub channel_id: String,
    pub schema_id: String,
    pub versions: Vec<StoredVersion>,
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map_err(|err| err.to_string())
}

/// 读取全部持久化事件（无文件时返回空列表）。
#[tauri::command]
pub fn events_load(app: tauri::AppHandle) -> Result<Vec<StoredEvent>, String> {
    let dir = app_data_dir(&app)?;
    store::load_events(&dir).map_err(|err| err.to_string())
}

/// 保存单条事件（按 id 覆盖），返回保存后的完整列表。
#[tauri::command]
pub fn events_save(
    app: tauri::AppHandle,
    event: StoredEvent,
) -> Result<Vec<StoredEvent>, String> {
    let dir = app_data_dir(&app)?;
    let mut list = store::load_events(&dir).map_err(|err| err.to_string())?;
    upsert_event(&mut list, event);
    store::save_events(&dir, &list).map_err(|err| err.to_string())?;
    Ok(list)
}

/// 按 id 删除事件，返回删除后的完整列表。
#[tauri::command]
pub fn events_delete(
    app: tauri::AppHandle,
    event_id: String,
) -> Result<Vec<StoredEvent>, String> {
    let dir = app_data_dir(&app)?;
    let mut list = store::load_events(&dir).map_err(|err| err.to_string())?;
    remove_event(&mut list, &event_id);
    store::save_events(&dir, &list).map_err(|err| err.to_string())?;
    Ok(list)
}

/// 列表内按 id 覆盖（新事件追加）。
pub fn upsert_event(list: &mut Vec<StoredEvent>, event: StoredEvent) {
    match list.iter().position(|item| item.id == event.id) {
        Some(index) => list[index] = event,
        None => list.push(event),
    }
}

/// 列表内按 id 移除。
pub fn remove_event(list: &mut Vec<StoredEvent>, event_id: &str) {
    list.retain(|item| item.id != event_id);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn version(revision: u64) -> StoredVersion {
        StoredVersion {
            revision,
            saved_at: format!("2026-09-12T0{revision}:00:00.000Z"),
            payload: serde_json::json!({ "event": "im_receive_msg" }),
            expected: ExpectedReceipt {
                status: 200,
                body: String::new(),
                body_mode: "contains".into(),
            },
        }
    }

    fn event(id: &str) -> StoredEvent {
        StoredEvent {
            id: id.into(),
            name: format!("事件 {id}"),
            channel_id: "douyin".into(),
            schema_id: "dy-text".into(),
            versions: vec![version(1)],
        }
    }

    #[test]
    fn upsert_replaces_same_id_and_appends_new() {
        let mut list = vec![event("a"), event("b")];
        let mut replaced = event("a");
        replaced.versions.push(version(2));
        upsert_event(&mut list, replaced.clone());
        assert_eq!(list.len(), 2);
        assert_eq!(list[0], replaced);

        upsert_event(&mut list, event("c"));
        assert_eq!(list.len(), 3);
        assert_eq!(list[2].id, "c");
    }

    #[test]
    fn remove_deletes_only_matching_id() {
        let mut list = vec![event("a"), event("b")];
        remove_event(&mut list, "a");
        assert_eq!(list, vec![event("b")]);
        remove_event(&mut list, "missing");
        assert_eq!(list.len(), 1);
    }
}
