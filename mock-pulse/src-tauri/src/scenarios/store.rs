//! 剧本持久化（ADR-0004 文件级归属）：`scenarios/<渠道>/<剧本id>.json`
//! 一剧本一文件；组 = 渠道子目录，文件文档不写渠道字段（单一源头是路径），
//! 读取时从子目录名回填渠道。文件读写接受根目录参数，测试用临时目录。

use std::fs;
use std::path::{Path, PathBuf};

use super::{ScenarioFile, StoredScenario};

const SCENARIOS_DIR: &str = "scenarios";

pub fn scenarios_dir(root: &Path) -> PathBuf {
    root.join(SCENARIOS_DIR)
}

fn scenario_file(channel_dir: &Path, scenario_id: &str) -> PathBuf {
    channel_dir.join(format!("{scenario_id}.json"))
}

/// 读取全部剧本：扫描 scenarios 下各渠道子目录（目录名 = 渠道），
/// 聚合并回填渠道。目录不存在返回空列表。顺序确定：渠道名、文件名排序。
pub fn load_scenarios(root: &Path) -> std::io::Result<Vec<StoredScenario>> {
    let root_dir = scenarios_dir(root);
    if !root_dir.exists() {
        return Ok(Vec::new());
    }
    let mut channel_dirs: Vec<PathBuf> = fs::read_dir(&root_dir)?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_dir())
        .collect();
    channel_dirs.sort();

    let mut scenarios = Vec::new();
    for channel_dir in channel_dirs {
        let channel = channel_dir
            .file_name()
            .map(|name| name.to_string_lossy().into_owned())
            .unwrap_or_default();
        let mut files: Vec<PathBuf> = fs::read_dir(&channel_dir)?
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
        for file in files {
            let raw = fs::read_to_string(&file)?;
            let parsed: ScenarioFile = serde_json::from_str(&raw).map_err(|err| {
                std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    format!("{} 解析失败：{err}", file.display()),
                )
            })?;
            scenarios.push(parsed.with_channel(channel.clone()));
        }
    }
    Ok(scenarios)
}

/// 保存单个剧本：原子写 `scenarios/<渠道>/<id>.json`；
/// 同 id 在其他渠道目录的旧文件一并清理（渠道仅无步骤时可换，落盘只留一份）。
pub fn save_scenario(root: &Path, scenario: &StoredScenario) -> std::io::Result<()> {
    let target_dir = scenarios_dir(root).join(&scenario.channel_id);
    fs::create_dir_all(&target_dir)?;

    // 清理其他渠道目录下的同 id 旧文件（换渠道后保存的场景）
    for stale in find_scenario_files(root, &scenario.id) {
        if stale.parent() != Some(&target_dir) {
            fs::remove_file(&stale)?;
        }
    }

    let path = scenario_file(&target_dir, &scenario.id);
    let raw = serde_json::to_string_pretty(&ScenarioFile::from(scenario))?;
    // 先写临时文件再原子替换，避免写一半损坏
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, raw)?;
    fs::rename(&tmp, &path)
}

/// 按 id 删除剧本：扫描各渠道目录移除对应文件；不存在视为成功。
pub fn delete_scenario(root: &Path, scenario_id: &str) -> std::io::Result<()> {
    for file in find_scenario_files(root, scenario_id) {
        fs::remove_file(&file)?;
    }
    Ok(())
}

/// 各渠道目录下名为 `<id>.json` 的文件（同一剧本跨目录至多一份）。
fn find_scenario_files(root: &Path, scenario_id: &str) -> Vec<PathBuf> {
    let root_dir = scenarios_dir(root);
    let Ok(entries) = fs::read_dir(&root_dir) else {
        return Vec::new();
    };
    let mut found = Vec::new();
    for channel_dir in entries.filter_map(|entry| entry.ok()).map(|e| e.path()) {
        if !channel_dir.is_dir() {
            continue;
        }
        let json = scenario_file(&channel_dir, scenario_id);
        if json.exists() {
            found.push(json);
        }
    }
    found
}

#[cfg(test)]
mod tests {
    use super::super::StoredStep;
    use super::*;
    use serde_json::Value;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir()
            .join("mock-pulse-scenarios-test")
            .join(format!("{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn douyin_scenario() -> StoredScenario {
        StoredScenario {
            favorite: true,
            revision: Some(3),
            failure: Some("continue".into()),
            id: "scn-dy-001".into(),
            name: "从进入到咨询".into(),
            channel_id: "douyin".into(),
            steps: vec![
                StoredStep {
                    wait: Some(0.6),
                    event_id: "evt-dy-1".into(),
                    revision: 1,
                },
                StoredStep {
                    wait: Some(0.6),
                    event_id: "evt-dy-2".into(),
                    revision: 3,
                },
            ],
        }
    }

    fn wecom_scenario() -> StoredScenario {
        StoredScenario {
            favorite: true,
            revision: Some(3),
            failure: Some("continue".into()),
            id: "scn-wc-001".into(),
            name: "企微接待".into(),
            channel_id: "wecom".into(),
            steps: vec![StoredStep {
                wait: Some(0.6),
                event_id: "evt-wc-1".into(),
                revision: 2,
            }],
        }
    }

    #[test]
    fn roundtrips_two_channels_each_in_own_subdirectory() {
        let dir = temp_dir("roundtrip");
        save_scenario(&dir, &douyin_scenario()).unwrap();
        save_scenario(&dir, &wecom_scenario()).unwrap();

        // 两渠道混合库存下各归其位
        assert!(scenario_file(&scenarios_dir(&dir).join("douyin"), "scn-dy-001").exists());
        assert!(scenario_file(&scenarios_dir(&dir).join("wecom"), "scn-wc-001").exists());

        // 读取聚合并回填渠道（文件级归属的反向）
        let loaded = load_scenarios(&dir).unwrap();
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0], douyin_scenario());
        assert_eq!(loaded[1], wecom_scenario());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn step_documents_have_no_group_field_and_no_channel_redundancy() {
        let dir = temp_dir("no-group");
        save_scenario(&dir, &douyin_scenario()).unwrap();

        let path = scenario_file(&scenarios_dir(&dir).join("douyin"), "scn-dy-001");
        let raw = fs::read_to_string(&path).unwrap();
        let doc: Value = serde_json::from_str(&raw).unwrap();

        // 顶层保留编辑元数据；渠道仍由路径承载，不写进文件
        let top_keys: Vec<&str> = doc
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        assert_eq!(
            top_keys,
            vec!["favorite", "revision", "failure", "id", "name", "steps"]
        );

        // 步骤键：eventId/revision/wait（camelCase），不含 group / channel
        for step in doc["steps"].as_array().unwrap() {
            let keys: Vec<&str> = step
                .as_object()
                .unwrap()
                .keys()
                .map(String::as_str)
                .collect();
            assert_eq!(keys, vec!["eventId", "revision", "wait"]);
        }
        assert!(!raw.contains("group"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn save_is_atomic_and_overwrites_previous_content() {
        let dir = temp_dir("atomic");
        save_scenario(&dir, &douyin_scenario()).unwrap();
        let mut updated = douyin_scenario();
        updated.name = "改名后".into();
        updated.steps.pop();
        save_scenario(&dir, &updated).unwrap();

        let loaded = load_scenarios(&dir).unwrap();
        assert_eq!(loaded, vec![updated]);

        // 原子写不留临时文件，目录里只有该剧本一个文件
        let channel_dir = scenarios_dir(&dir).join("douyin");
        let entries: Vec<String> = fs::read_dir(&channel_dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(entries, vec!["scn-dy-001.json".to_string()]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn missing_directory_yields_empty_list() {
        let dir = temp_dir("missing");
        assert!(load_scenarios(&dir).unwrap().is_empty());
        // 删除不存在的剧本也成功
        delete_scenario(&dir, "scn-none").unwrap();
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn saving_moved_channel_leaves_only_the_new_copy() {
        let dir = temp_dir("move");
        save_scenario(&dir, &wecom_scenario()).unwrap();

        // 无步骤剧本换渠道后保存：旧渠道目录不得残留
        let mut moved = wecom_scenario();
        moved.steps.clear();
        moved.channel_id = "douyin".into();
        save_scenario(&dir, &moved).unwrap();

        assert!(!scenario_file(&scenarios_dir(&dir).join("wecom"), "scn-wc-001").exists());
        assert!(scenario_file(&scenarios_dir(&dir).join("douyin"), "scn-wc-001").exists());

        let loaded = load_scenarios(&dir).unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].channel_id, "douyin");
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn delete_removes_only_the_matching_file() {
        let dir = temp_dir("delete");
        save_scenario(&dir, &douyin_scenario()).unwrap();
        save_scenario(&dir, &wecom_scenario()).unwrap();

        delete_scenario(&dir, "scn-dy-001").unwrap();
        let loaded = load_scenarios(&dir).unwrap();
        assert_eq!(loaded, vec![wecom_scenario()]);

        delete_scenario(&dir, "scn-dy-001").unwrap(); // 再删不报错
        fs::remove_dir_all(&dir).unwrap();
    }
}
