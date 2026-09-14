//! 执行编排域：把多个已保存剧本组成一次执行（跨渠道，无平台归属）。
//! mode = parallel（多剧本同时启动、剧内严格有序）| serial（逐剧本完整执行）；
//! failure = stop（任一剧本失败即停整个编排）| continue（记录后继续其余剧本）。
//! 持久化为平铺目录 `plans/<id>.json`——编排跨渠道，没有剧本那样的
//! 文件级分组（ADR-0004 的组语义只约束剧本按渠道归属），文档不冗余渠道字段。

pub mod store;

use serde::{Deserialize, Serialize};

use crate::app_data_dir;

/// 执行模式：parallel = 全部剧本 T+0 同时起跑；serial = 前一剧本结束才启下一剧。
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PlanMode {
    Parallel,
    Serial,
}

/// 失败策略：stop = 任一剧本失败即停整个编排；continue = 记录后继续其余剧本。
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PlanFailure {
    Stop,
    Continue,
}

/// 编排项：引用一个已保存剧本。items 有序即 lanes；
/// 引用只存 id（与剧本步骤同哲学），运行时经引用解析物化，不复制剧本内容。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredPlanItem {
    pub scenario_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub snapshot: Option<crate::scenarios::StoredScenario>,
}

/// 与前端交换的编排形态（camelCase 契约）。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredPlan {
    pub id: String,
    pub name: String,
    pub mode: PlanMode,
    pub failure: PlanFailure,
    /// 素材库收藏星标（旧文档缺省 false）
    #[serde(default)]
    pub favorite: bool,
    pub items: Vec<StoredPlanItem>,
}

/// 读取全部编排（无 plans 目录时返回空列表）。
#[tauri::command]
pub fn plans_load(app: tauri::AppHandle) -> Result<Vec<StoredPlan>, String> {
    let dir = app_data_dir(&app)?;
    store::load_plans(&dir).map_err(|err| err.to_string())
}

/// 保存单个编排（按 id 覆盖），返回保存后的完整列表。
#[tauri::command]
pub fn plans_save(app: tauri::AppHandle, plan: StoredPlan) -> Result<Vec<StoredPlan>, String> {
    let dir = app_data_dir(&app)?;
    store::save_plan(&dir, &plan).map_err(|err| err.to_string())?;
    store::load_plans(&dir).map_err(|err| err.to_string())
}

/// 按 id 删除编排，返回删除后的完整列表。
#[tauri::command]
pub fn plans_delete(app: tauri::AppHandle, plan_id: String) -> Result<Vec<StoredPlan>, String> {
    let dir = app_data_dir(&app)?;
    store::delete_plan(&dir, &plan_id).map_err(|err| err.to_string())?;
    store::load_plans(&dir).map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(super) fn sample_plan(id: &str) -> StoredPlan {
        StoredPlan {
            id: id.into(),
            name: "双平台接待回归".into(),
            mode: PlanMode::Parallel,
            failure: PlanFailure::Continue,
            favorite: false,
            items: vec![
                StoredPlanItem {
                    snapshot: None,
                    scenario_id: "scn-dy-001".into(),
                },
                StoredPlanItem {
                    snapshot: None,
                    scenario_id: "scn-wc-001".into(),
                },
            ],
        }
    }

    #[test]
    fn plan_serializes_camel_case_for_frontend() {
        let raw = serde_json::to_string(&sample_plan("plan-1")).unwrap();
        assert!(raw.contains("\"mode\":\"parallel\""));
        assert!(raw.contains("\"failure\":\"continue\""));
        assert!(raw.contains("\"scenarioId\":\"scn-dy-001\""));
        assert!(!raw.contains("scenario_id"));

        let mut serial = sample_plan("plan-2");
        serial.mode = PlanMode::Serial;
        serial.failure = PlanFailure::Stop;
        let raw = serde_json::to_string(&serial).unwrap();
        assert!(raw.contains("\"mode\":\"serial\""));
        assert!(raw.contains("\"failure\":\"stop\""));
    }

    #[test]
    fn plan_roundtrips_through_json() {
        let plan = sample_plan("plan-1");
        let raw = serde_json::to_string(&plan).unwrap();
        let back: StoredPlan = serde_json::from_str(&raw).unwrap();
        assert_eq!(back, plan);
    }

    #[test]
    fn plan_deserializes_legacy_documents_without_favorite() {
        // 旧文档没有 favorite 字段：反序列化为 false，不丢数据
        let raw = serde_json::json!({
            "id": "plan-old",
            "name": "旧编排",
            "mode": "serial",
            "failure": "stop",
            "items": [{ "scenarioId": "scn-1" }]
        })
        .to_string();
        let plan: StoredPlan = serde_json::from_str(&raw).unwrap();
        assert!(!plan.favorite);
        assert_eq!(plan.mode, PlanMode::Serial);
        assert_eq!(plan.failure, PlanFailure::Stop);
        assert_eq!(plan.items.len(), 1);
    }
}
