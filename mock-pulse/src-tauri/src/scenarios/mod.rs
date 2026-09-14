//! 剧本域（ADR-0004）：每平台独立剧本、禁跨平台混写。
//! 持久化按渠道子目录分组（文件级归属），步骤只存事件版本引用，不含 group 字段。

pub mod store;

use serde::{Deserialize, Serialize};

use crate::app_data_dir;

/// 剧本步骤：引用素材库事件的一个版本。渠道由剧本（文件所在子目录）承载，
/// 步骤不冗余 group/channel 字段。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredStep {
    pub event_id: String,
    pub revision: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wait: Option<f64>,
}

/// 与前端交换的剧本形态（camelCase 契约）。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredScenario {
    #[serde(default)]
    pub favorite: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revision: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure: Option<String>,
    pub id: String,
    pub name: String,
    pub channel_id: String,
    pub steps: Vec<StoredStep>,
}

/// 落盘形态：渠道由 `scenarios/<渠道>/` 路径承载，文档不写渠道字段（单一源头）。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
struct ScenarioFile {
    #[serde(default)]
    favorite: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    revision: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    failure: Option<String>,
    id: String,
    name: String,
    steps: Vec<StoredStep>,
}

impl From<&StoredScenario> for ScenarioFile {
    fn from(scenario: &StoredScenario) -> Self {
        ScenarioFile {
            favorite: scenario.favorite,
            revision: scenario.revision,
            failure: scenario.failure.clone(),
            id: scenario.id.clone(),
            name: scenario.name.clone(),
            steps: scenario.steps.clone(),
        }
    }
}

impl ScenarioFile {
    /// 文件级归属的反向：渠道从所在子目录名回填。
    fn with_channel(self, channel_id: String) -> StoredScenario {
        StoredScenario {
            favorite: self.favorite,
            revision: self.revision,
            failure: self.failure,
            id: self.id,
            name: self.name,
            channel_id,
            steps: self.steps,
        }
    }
}

/// 读取全部剧本（无 scenarios 目录时返回空列表；渠道由子目录回填）。
#[tauri::command]
pub fn scenarios_load(app: tauri::AppHandle) -> Result<Vec<StoredScenario>, String> {
    let dir = app_data_dir(&app)?;
    store::load_scenarios(&dir).map_err(|err| err.to_string())
}

/// 保存单个剧本（一剧本一文件，按渠道子目录落位），返回保存后的完整列表。
#[tauri::command]
pub fn scenarios_save(
    app: tauri::AppHandle,
    scenario: StoredScenario,
) -> Result<Vec<StoredScenario>, String> {
    let dir = app_data_dir(&app)?;
    store::save_scenario(&dir, &scenario).map_err(|err| err.to_string())?;
    store::load_scenarios(&dir).map_err(|err| err.to_string())
}

/// 按 id 删除剧本，返回删除后的完整列表。
#[tauri::command]
pub fn scenarios_delete(
    app: tauri::AppHandle,
    scenario_id: String,
) -> Result<Vec<StoredScenario>, String> {
    let dir = app_data_dir(&app)?;
    store::delete_scenario(&dir, &scenario_id).map_err(|err| err.to_string())?;
    store::load_scenarios(&dir).map_err(|err| err.to_string())
}
