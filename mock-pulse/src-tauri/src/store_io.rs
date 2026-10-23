//! 域 JSON 文件读写公共原语（Reuse-first 审计退件：六个域 store 曾各抄一份
//! 「exists → 读 → parse + InvalidData」与「create_dir_all → pretty → 临时
//! 文件 → rename」）：单点收敛，各域 store 只保留文件名/目录布局等域语义。
//! 损坏自愈也收敛在此（[`load_json_or_quarantine`]）：解析失败的域文件改名
//! `*.corrupt-<毫秒时间戳>` 隔离留现场，按缺失语义恢复，不再整域瘫痪。

use std::fs;
use std::path::Path;
use std::sync::Mutex;

/// 全局写锁：读改写持久化（load → 修改 → save）的唯一串行点。
/// 各域「读改写」命令统一经 [`with_write_lock`] 执行，域内不再各自持有
/// 私有锁；纪律：锁内不得再获取本锁（无嵌套），故无死锁路径。
static WRITE_LOCK: Mutex<()> = Mutex::new(());

/// 进入全局写锁执行一段读改写持久化。锁中毒时沿用持毒锁继续（持毒方
/// 只是写盘中途 panic，临时文件 + rename 原子写保证损坏不落盘）。
pub(crate) fn with_write_lock<T>(write: impl FnOnce() -> T) -> T {
    let _guard = WRITE_LOCK.lock().unwrap_or_else(|error| error.into_inner());
    write()
}

/// 损坏自愈读：解析成功返回 `Some`；文件不存在、或解析失败且已把损坏文件
/// 改名隔离（`<原名>.corrupt-<毫秒时间戳>`，保留现场供人工检查，扩展名替换
/// 也让目录扫描不再当 JSON 捡起）时返回 `None`——「不可用」统一折叠为
/// 「缺失」，由调用方按缺失语义处理（单文件域 [`load_json`] 取默认态，
/// 目录扫描跳过该文件），损坏不再整域瘫痪。隔离改名本身失败（权限等 IO
/// 错误）时上抛，不吞错。
pub(crate) fn load_json_or_quarantine<T: serde::de::DeserializeOwned>(
    path: &Path,
) -> std::io::Result<Option<T>> {
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(path)?;
    match serde_json::from_str(&raw) {
        Ok(value) => Ok(Some(value)),
        Err(cause) => {
            let millis = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_or(0, |span| span.as_millis());
            let quarantine = path.with_extension(format!("corrupt-{millis}"));
            fs::rename(path, &quarantine)?;
            eprintln!(
                "[store_io] 域文件损坏已隔离, file={}, quarantine={}, cause={cause}",
                path.display(),
                quarantine.display()
            );
            Ok(None)
        }
    }
}

/// 读单文件域数据：缺失或损坏（已隔离）返回空态（`T::default()`）。
pub(crate) fn load_json<T: serde::de::DeserializeOwned + Default>(
    path: &Path,
) -> std::io::Result<T> {
    Ok(load_json_or_quarantine(path)?.unwrap_or_default())
}

/// 原子写：`create_dir_all` → pretty JSON → 临时文件 `.json.tmp` → rename
/// （避免写一半损坏）。
pub(crate) fn save_json_atomic<T: serde::Serialize + ?Sized>(
    dir: &Path,
    path: &Path,
    value: &T,
) -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    let raw = serde_json::to_string_pretty(value)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, raw)?;
    fs::rename(&tmp, path)
}

/// 命名单文件域读（C5）：目录 + 文件名 → join 后走 [`load_json`]。
/// 单文件布局的域（connections/events/runs/definitions）经此收敛，各自
/// 只保留文件名常量与 `*_file()` 路径函数（测试 legacy 夹具写盘与存在
/// 断言用）；目录型布局（plans/scenarios）不走这里，另有扫描语义。
pub(crate) fn load_named<T: serde::de::DeserializeOwned + Default>(
    dir: &Path,
    file_name: &str,
) -> std::io::Result<T> {
    load_json(&dir.join(file_name))
}

/// 命名单文件域原子写（C5）：目录 + 文件名 → join 后走
/// [`save_json_atomic`]。
pub(crate) fn save_named<T: serde::Serialize + ?Sized>(
    dir: &Path,
    file_name: &str,
    value: &T,
) -> std::io::Result<()> {
    let path = dir.join(file_name);
    save_json_atomic(dir, &path, value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default, serde::Deserialize, PartialEq, Debug)]
    struct Fixture {
        items: Vec<String>,
    }

    fn temp_dir(tag: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir()
            .join("mock-pulse-store-io-test")
            .join(format!("{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn missing_file_loads_default() {
        let dir = temp_dir("missing");
        let loaded: Fixture = load_json(&dir.join("absent.json")).unwrap();
        assert_eq!(loaded, Fixture::default());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn corrupt_file_is_quarantined_and_loads_default() {
        let dir = temp_dir("corrupt");
        let path = dir.join("domain.json");
        fs::write(&path, "{ not json").unwrap();

        let loaded: Fixture = load_json(&path).unwrap();
        assert_eq!(loaded, Fixture::default());

        // 损坏文件改名隔离留现场（扩展名替换后不再是 .json），原路径视为缺失
        let mut leftovers: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        leftovers.sort();
        assert_eq!(leftovers.len(), 1);
        assert!(leftovers[0].starts_with("domain.corrupt-"));
        assert!(!leftovers[0].ends_with(".json"));

        // 修复路径上再读即走缺失分支（隔离文件不被捡起）
        let again: Fixture = load_json(&path).unwrap();
        assert_eq!(again, Fixture::default());
        fs::remove_dir_all(&dir).unwrap();
    }
}
