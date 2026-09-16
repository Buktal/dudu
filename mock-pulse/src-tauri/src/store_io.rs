//! 域 JSON 文件读写公共原语（Reuse-first 审计退件：六个域 store 曾各抄一份
//! 「exists → 读 → parse + InvalidData」与「create_dir_all → pretty → 临时
//! 文件 → rename」）：单点收敛，各域 store 只保留文件名/目录布局等域语义。

use std::fs;
use std::path::Path;

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
