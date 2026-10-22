//! 运行记录的本地文件持久化：runs.json 存于应用数据目录。
//! 文件读写函数接受目录参数，测试用临时目录。

use std::path::Path;

use super::RunRecord;

const FILE_NAME: &str = "runs.json";

pub fn load_runs(dir: &Path) -> std::io::Result<Vec<RunRecord>> {
    crate::store_io::load_named(dir, FILE_NAME)
}

pub fn save_runs(dir: &Path, runs: &[RunRecord]) -> std::io::Result<()> {
    crate::store_io::save_named(dir, FILE_NAME, runs)
}

/// 同一条运行可重试保存；读改写经全局写锁串行（store_io::with_write_lock
/// 单点，与各域写命令同一纪律），避免重试与后台完成互相覆盖；
/// 锁内不再取本锁，无死锁路径。
pub fn upsert_run(dir: &Path, run: RunRecord) -> std::io::Result<Vec<RunRecord>> {
    crate::store_io::with_write_lock(|| {
        let mut runs = load_runs(dir)?;
        if let Some(index) = runs.iter().position(|item| item.id == run.id) {
            runs[index] = run;
        } else {
            runs.push(run);
        }
        save_runs(dir, &runs)?;
        Ok(runs)
    })
}

#[cfg(test)]
mod tests {
    use super::super::tests::sample_run;
    use super::*;
    use std::fs;
    use std::path::PathBuf;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir()
            .join("mock-pulse-runs-test")
            .join(format!("{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn roundtrips_runs_with_snapshots() {
        let dir = temp_dir("roundtrip");
        let runs = vec![sample_run("run-1"), sample_run("run-2")];
        save_runs(&dir, &runs).unwrap();
        assert_eq!(load_runs(&dir).unwrap(), runs);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn missing_file_yields_empty_list() {
        let dir = temp_dir("missing");
        assert!(load_runs(&dir).unwrap().is_empty());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn save_is_atomic_and_appends_keep_order() {
        let dir = temp_dir("atomic");
        save_runs(&dir, &[sample_run("run-1")]).unwrap();
        let mut list = load_runs(&dir).unwrap();
        list.push(sample_run("run-2"));
        save_runs(&dir, &list).unwrap();
        let reloaded = load_runs(&dir).unwrap();
        assert_eq!(
            reloaded
                .iter()
                .map(|run| run.id.clone())
                .collect::<Vec<_>>(),
            vec!["run-1", "run-2"],
            "运行记录按追加顺序持久化"
        );
        // 原子写不留临时文件
        let entries: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(entries, vec![FILE_NAME.to_string()]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn payload_snapshot_roundtrips_verbatim() {
        // 明文载荷以字符串快照保存：往返逐字节一致（含非 ASCII）
        let dir = temp_dir("payload");
        let mut run = sample_run("run-1");
        run.steps[0].payload =
            r#"{"event":"im_receive_msg","content":{"text":"你好，抖音"}}"#.into();
        save_runs(&dir, &[run.clone()]).unwrap();
        let reloaded = load_runs(&dir).unwrap();
        assert_eq!(reloaded[0].steps[0].payload, run.steps[0].payload);
        fs::remove_dir_all(&dir).unwrap();
    }
}
