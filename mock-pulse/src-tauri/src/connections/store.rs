//! 连接配置的本地文件持久化：JSON 文件存于应用数据目录。
//! 文件读写函数接受目录参数，测试用临时目录。

use std::fs;
use std::path::{Path, PathBuf};

use super::ConnectionConfig;

const FILE_NAME: &str = "connections.json";

pub fn connections_file(dir: &Path) -> PathBuf {
    dir.join(FILE_NAME)
}

pub fn load_connections(dir: &Path) -> std::io::Result<Vec<ConnectionConfig>> {
    let path = connections_file(dir);
    if !path.exists() {
        return Ok(Vec::new());
    }
    let raw = fs::read_to_string(&path)?;
    serde_json::from_str(&raw).map_err(|err| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidData,
            format!("{} 解析失败：{err}", path.display()),
        )
    })
}

pub fn save_connections(dir: &Path, configs: &[ConnectionConfig]) -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    let path = connections_file(dir);
    let raw = serde_json::to_string_pretty(configs)?;
    // 先写临时文件再原子替换，避免写一半损坏
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, raw)?;
    fs::rename(&tmp, &path)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir()
            .join("mock-pulse-connections-test")
            .join(format!("{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn roundtrips_connections_through_json_file() {
        let dir = temp_dir("roundtrip");
        let configs = vec![ConnectionConfig {
            channel: "douyin".into(),
            url: "http://127.0.0.1:8080/webhooks/douyin".into(),
            client_key: "tt_key".into(),
            client_secret: "tt_secret".into(),
        }];
        save_connections(&dir, &configs).unwrap();
        assert!(connections_file(&dir).exists());
        assert_eq!(load_connections(&dir).unwrap(), configs);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn missing_file_yields_empty_list() {
        let dir = temp_dir("missing");
        assert!(load_connections(&dir).unwrap().is_empty());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn file_uses_camel_case_keys_for_frontend_contract() {
        let dir = temp_dir("camel");
        let configs = vec![ConnectionConfig {
            channel: "douyin".into(),
            url: "http://localhost/hook".into(),
            client_key: "k".into(),
            client_secret: "s".into(),
        }];
        save_connections(&dir, &configs).unwrap();
        let raw = fs::read_to_string(connections_file(&dir)).unwrap();
        assert!(raw.contains("\"clientKey\""));
        assert!(raw.contains("\"clientSecret\""));
        assert!(!raw.contains("client_key"));
        fs::remove_dir_all(&dir).unwrap();
    }
}
