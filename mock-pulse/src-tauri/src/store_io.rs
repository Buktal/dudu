//! 域 JSON 文件读写公共原语（Reuse-first 审计退件：六个域 store 曾各抄一份
//! 「exists → 读 → parse + InvalidData」与「create_dir_all → pretty → 临时
//! 文件 → rename」）：单点收敛，各域 store 只保留文件名/目录布局等域语义。

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

/// 解析单个 JSON 文件：读全 + serde 反序列化；解析失败映射 `InvalidData`
/// （带路径与原始错误，六个域的错误文案单点）。
pub(crate) fn parse_json_file<T: serde::de::DeserializeOwned>(
    path: &Path,
) -> std::io::Result<T> {
    let raw = fs::read_to_string(path)?;
    serde_json::from_str(&raw).map_err(|err| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("{} 解析失败：{err}", path.display()),
        )
    })
}

/// 读单文件域数据：文件不存在返回空态（`T::default()`），存在则走
/// [`parse_json_file`]。
pub(crate) fn load_json<T: serde::de::DeserializeOwned + Default>(
    path: &Path,
) -> std::io::Result<T> {
    if !path.exists() {
        return Ok(T::default());
    }
    parse_json_file(path)
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
