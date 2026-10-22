//! 字段说明域（#22）：用户编辑的字段定义，按 schemaId 覆写随应用分发的
//! 渠道描述文件基线。结构校验在前端 loader（definitions/loader.ts），
//! 这里只负责可靠存取：单文件 `field-definitions.json`，原子写。

pub mod store;

use serde::{Deserialize, Serialize};

use crate::app_data_dir;

/// 单个事件模板的用户字段定义。fields 为 FieldDescriptor 数组
/// （path/title/type/group/description + 可选 required/format/multiline），
/// 形状由前端 loader 校验，存储层按 Value 原样保留（照 events 载荷先例）。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StoredSchemaDefinition {
    pub schema_id: String,
    /// 定义编辑时所依据的描述符版本；旧数据缺省按空串读入。
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub fields: serde_json::Value,
}

/// 落盘/交换形态：`{schemas:{<schemaId>:{schemaId,version,fields}}}`（camelCase 契约）。
/// schemas 是按 schemaId 索引的注册表，BTreeMap 键序（字母序）不影响语义。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct DefinitionsDoc {
    #[serde(default)]
    pub schemas: std::collections::BTreeMap<String, StoredSchemaDefinition>,
}

/// 读取全部用户字段定义（无文件时返回空文档）。
#[tauri::command]
pub fn definitions_load(app: tauri::AppHandle) -> Result<DefinitionsDoc, String> {
    let dir = app_data_dir(&app)?;
    store::load_definitions(&dir).map_err(|err| err.to_string())
}

/// 按 schemaId 整体覆写该模板的用户定义，返回保存后的完整文档。
#[tauri::command]
pub fn definitions_save(
    app: tauri::AppHandle,
    schema_id: String,
    definition: StoredSchemaDefinition,
) -> Result<DefinitionsDoc, String> {
    let dir = app_data_dir(&app)?;
    // 读改写全程串行（store_io::with_write_lock 全局写锁单点）
    crate::store_io::with_write_lock(|| {
        store::save_definition(&dir, &schema_id, definition).map_err(|err| err.to_string())
    })
}
