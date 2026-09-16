//! 字段说明持久化：`field-definitions.json` 存于应用数据目录，camelCase 契约。
//! 文件读写函数接受目录参数，测试用临时目录；先写临时文件再原子替换。

use std::path::{Path, PathBuf};

use super::{DefinitionsDoc, StoredSchemaDefinition};

const FILE_NAME: &str = "field-definitions.json";

pub fn definitions_file(dir: &Path) -> PathBuf {
    dir.join(FILE_NAME)
}

pub fn load_definitions(dir: &Path) -> std::io::Result<DefinitionsDoc> {
    crate::store_io::load_json(&definitions_file(dir))
}

/// 按 schemaId 整体覆写该模板的用户定义（原子写），返回保存后的完整文档。
pub fn save_definition(
    dir: &Path,
    schema_id: &str,
    definition: StoredSchemaDefinition,
) -> std::io::Result<DefinitionsDoc> {
    let mut doc = load_definitions(dir)?;
    doc.schemas.insert(schema_id.to_string(), definition);

    crate::store_io::save_json_atomic(dir, &definitions_file(dir), &doc)?;
    Ok(doc)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;
    use std::fs;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir()
            .join("mock-pulse-definitions-test")
            .join(format!("{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// 与前端「应用说明」落库一致的形态：fields 为 FieldDescriptor 数组（Value 直存）
    fn dy_text_definition() -> StoredSchemaDefinition {
        StoredSchemaDefinition {
            schema_id: "dy-text".into(),
            version: "2026.09".into(),
            fields: serde_json::json!([
                {
                    "path": "content.guest_id",
                    "title": "访客 ID",
                    "type": "string",
                    "group": "用户与身份",
                    "description": "补录的第三方访客标识。",
                    "required": true
                },
                {
                    "path": "content.text",
                    "title": "客人原话",
                    "type": "string",
                    "group": "客人输入",
                    "description": "改写后的说明。"
                }
            ]),
        }
    }

    #[test]
    fn roundtrips_definitions_across_restart() {
        let dir = temp_dir("roundtrip");
        let doc = save_definition(&dir, "dy-text", dy_text_definition()).unwrap();
        assert_eq!(doc.schemas.len(), 1);

        save_definition(
            &dir,
            "wc-enter",
            StoredSchemaDefinition {
                schema_id: "wc-enter".into(),
                version: "2026.09".into(),
                fields: serde_json::json!([]),
            },
        )
        .unwrap();

        let loaded = load_definitions(&dir).unwrap();
        assert_eq!(loaded, doc_with_two());
        assert_eq!(
            loaded.schemas["dy-text"].fields,
            dy_text_definition().fields
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    fn doc_with_two() -> DefinitionsDoc {
        let mut schemas = std::collections::BTreeMap::new();
        schemas.insert("dy-text".into(), dy_text_definition());
        schemas.insert(
            "wc-enter".into(),
            StoredSchemaDefinition {
                schema_id: "wc-enter".into(),
                version: "2026.09".into(),
                fields: serde_json::json!([]),
            },
        );
        DefinitionsDoc { schemas }
    }

    #[test]
    fn document_uses_camel_case_contract() {
        let dir = temp_dir("camel");
        save_definition(&dir, "dy-text", dy_text_definition()).unwrap();
        let raw = fs::read_to_string(definitions_file(&dir)).unwrap();
        let doc: Value = serde_json::from_str(&raw).unwrap();

        // 顶层键：schemas；条目键：schemaId/version/fields（camelCase）
        let top_keys: Vec<&str> =
            doc.as_object().unwrap().keys().map(String::as_str).collect();
        assert_eq!(top_keys, vec!["schemas"]);
        let entry = &doc["schemas"]["dy-text"];
        let keys: Vec<&str> =
            entry.as_object().unwrap().keys().map(String::as_str).collect();
        assert_eq!(keys, vec!["schemaId", "version", "fields"]);
        assert!(!raw.contains("schema_id"));
    }

    #[test]
    fn save_is_atomic_and_overwrites_previous_content() {
        let dir = temp_dir("atomic");
        save_definition(&dir, "dy-text", dy_text_definition()).unwrap();

        let mut updated = dy_text_definition();
        updated.version = "2026.10".into();
        updated.fields = serde_json::json!([]);
        save_definition(&dir, "dy-text", updated).unwrap();

        let loaded = load_definitions(&dir).unwrap();
        assert_eq!(loaded.schemas.len(), 1);
        assert_eq!(loaded.schemas["dy-text"].version, "2026.10");

        // 原子写不留临时文件，目录里只有该文件
        let entries: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(entries, vec![FILE_NAME.to_string()]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn missing_file_yields_empty_doc() {
        let dir = temp_dir("missing");
        assert_eq!(load_definitions(&dir).unwrap(), DefinitionsDoc::default());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn legacy_entry_without_version_and_fields_still_loads() {
        // 旧版本文件：条目只有 schemaId，无 version/fields——缺省读入不炸
        let dir = temp_dir("legacy");
        fs::write(
            definitions_file(&dir),
            r#"{"schemas":{"dy-text":{"schemaId":"dy-text"}}}"#,
        )
        .unwrap();

        let loaded = load_definitions(&dir).unwrap();
        assert_eq!(loaded.schemas["dy-text"].schema_id, "dy-text");
        assert_eq!(loaded.schemas["dy-text"].version, "");
        assert_eq!(loaded.schemas["dy-text"].fields, serde_json::json!(null));
        fs::remove_dir_all(&dir).unwrap();
    }
}
