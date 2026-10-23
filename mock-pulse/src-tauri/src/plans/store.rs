//! 编排持久化：平铺目录 `plans/<编排id>.json`，一编排一文件。
//! 编排跨渠道（无子目录分组），文档 = {id,name,mode,failure,favorite,items}。
//! 文件读写接受根目录参数，测试用临时目录。

use std::fs;
use std::path::{Path, PathBuf};

use super::StoredPlan;

const PLANS_DIR: &str = "plans";

pub fn plans_dir(root: &Path) -> PathBuf {
    root.join(PLANS_DIR)
}

fn plan_file(dir: &Path, plan_id: &str) -> PathBuf {
    dir.join(format!("{plan_id}.json"))
}

/// 读取全部编排：扫描 plans 目录（文件名排序，顺序确定）。
/// 目录不存在返回空列表。
pub fn load_plans(root: &Path) -> std::io::Result<Vec<StoredPlan>> {
    let dir = plans_dir(root);
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut files: Vec<PathBuf> = fs::read_dir(&dir)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| {
            path.is_file()
                && path
                    .extension()
                    .is_some_and(|ext| ext.eq_ignore_ascii_case("json"))
        })
        .collect();
    files.sort();

    let mut plans = Vec::new();
    for file in files {
        // 损坏文件由 store_io 隔离改名（.corrupt-*，不再匹配 .json 扩展名），
        // 此处按缺失跳过，单个损坏编排不再瘫痪整个域
        if let Some(plan) = crate::store_io::load_json_or_quarantine::<StoredPlan>(&file)? {
            plans.push(plan);
        }
    }
    Ok(plans)
}

/// 保存单个编排：原子写 `plans/<id>.json`（先写临时文件再 rename，避免写一半损坏）。
pub fn save_plan(root: &Path, plan: &StoredPlan) -> std::io::Result<()> {
    let dir = plans_dir(root);
    crate::store_io::save_json_atomic(&dir, &plan_file(&dir, &plan.id), plan)
}

/// 按 id 删除编排；不存在视为成功。
pub fn delete_plan(root: &Path, plan_id: &str) -> std::io::Result<()> {
    let path = plan_file(&plans_dir(root), plan_id);
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::tests::sample_plan;
    use super::*;
    use serde_json::Value;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir()
            .join("mock-pulse-plans-test")
            .join(format!("{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn roundtrips_plans_flat_directory() {
        let dir = temp_dir("roundtrip");
        let mut other = sample_plan("plan-b");
        other.mode = super::super::PlanMode::Serial;
        save_plan(&dir, &sample_plan("plan-a")).unwrap();
        save_plan(&dir, &other).unwrap();

        // 平铺目录：没有渠道子目录
        assert!(plan_file(&plans_dir(&dir), "plan-a").exists());
        assert!(plan_file(&plans_dir(&dir), "plan-b").exists());
        let entries: Vec<String> = fs::read_dir(plans_dir(&dir))
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(
            entries,
            vec!["plan-a.json".to_string(), "plan-b.json".to_string()]
        );

        // 读取聚合（文件名排序）并完整还原
        let loaded = load_plans(&dir).unwrap();
        assert_eq!(loaded, vec![sample_plan("plan-a"), other]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn document_has_flat_item_reference_shape() {
        // 文档形态：{id,name,mode,failure,favorite,items:[{scenarioId}]}——
        // 编排只存剧本引用，不复制剧本内容
        let dir = temp_dir("doc-shape");
        save_plan(&dir, &sample_plan("plan-a")).unwrap();

        let raw = fs::read_to_string(plan_file(&plans_dir(&dir), "plan-a")).unwrap();
        let doc: Value = serde_json::from_str(&raw).unwrap();
        let top_keys: Vec<&str> = doc
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        assert_eq!(
            top_keys,
            vec!["id", "name", "mode", "failure", "favorite", "items"]
        );
        let item = &doc["items"][0];
        let item_keys: Vec<&str> = item
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        assert_eq!(item_keys, vec!["scenarioId"]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn save_is_atomic_and_overwrites_previous_content() {
        let dir = temp_dir("atomic");
        save_plan(&dir, &sample_plan("plan-a")).unwrap();
        let mut updated = sample_plan("plan-a");
        updated.name = "改名后".into();
        updated.items.pop();
        updated.favorite = true;
        save_plan(&dir, &updated).unwrap();

        let loaded = load_plans(&dir).unwrap();
        assert_eq!(loaded, vec![updated]);

        // 原子写不留临时文件
        let entries: Vec<String> = fs::read_dir(plans_dir(&dir))
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(entries, vec!["plan-a.json".to_string()]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn corrupt_plan_is_quarantined_and_skipped() {
        let dir = temp_dir("corrupt");
        save_plan(&dir, &sample_plan("plan-a")).unwrap();
        fs::write(plan_file(&plans_dir(&dir), "plan-bad"), "{ not json").unwrap();

        // 好文件照常加载；损坏文件隔离改名留现场，不再瘫痪整个域
        let loaded = load_plans(&dir).unwrap();
        assert_eq!(loaded, vec![sample_plan("plan-a")]);
        let names: Vec<String> = fs::read_dir(plans_dir(&dir))
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|name| name.starts_with("plan-bad"))
            .collect();
        assert_eq!(names.len(), 1);
        assert!(names[0].starts_with("plan-bad.corrupt-"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn missing_directory_yields_empty_list() {
        let dir = temp_dir("missing");
        assert!(load_plans(&dir).unwrap().is_empty());
        // 删除不存在的编排也成功
        delete_plan(&dir, "plan-none").unwrap();
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn delete_removes_only_the_matching_file() {
        let dir = temp_dir("delete");
        save_plan(&dir, &sample_plan("plan-a")).unwrap();
        save_plan(&dir, &sample_plan("plan-b")).unwrap();

        delete_plan(&dir, "plan-a").unwrap();
        let loaded = load_plans(&dir).unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "plan-b");

        delete_plan(&dir, "plan-a").unwrap(); // 再删不报错
        fs::remove_dir_all(&dir).unwrap();
    }
}
