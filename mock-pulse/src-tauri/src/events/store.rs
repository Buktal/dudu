//! 事件素材库的本地文件持久化：events.json 存于应用数据目录。
//! 文件读写函数接受目录参数，测试用临时目录。

use std::fs;
use std::path::{Path, PathBuf};

use super::StoredEvent;

const FILE_NAME: &str = "events.json";

pub fn events_file(dir: &Path) -> PathBuf {
    dir.join(FILE_NAME)
}

pub fn load_events(dir: &Path) -> std::io::Result<Vec<StoredEvent>> {
    let path = events_file(dir);
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

pub fn save_events(dir: &Path, events: &[StoredEvent]) -> std::io::Result<()> {
    fs::create_dir_all(dir)?;
    let path = events_file(dir);
    let raw = serde_json::to_string_pretty(events)?;
    // 先写临时文件再原子替换，避免写一半损坏
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, raw)?;
    fs::rename(&tmp, &path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::{ExpectedReceipt, StoredVersion};
    use serde_json::json;

    fn temp_dir(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir()
            .join("mock-pulse-events-test")
            .join(format!("{tag}-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn sample_event() -> StoredEvent {
        StoredEvent {
            id: "evt-001".into(),
            name: "新客问价".into(),
            channel_id: "douyin".into(),
            schema_id: "dy-text".into(),
            versions: vec![
                StoredVersion {
                    revision: 1,
                    saved_at: "2026-09-12T01:00:00.000Z".into(),
                    payload: json!({
                        "event": "im_receive_msg",
                        "from_user_id": "ac6479a5-d7a6-4018-84be-c29bfc00000",
                        "custom_unknown_field": { "nested": [1, "two", null] },
                        "content": { "text": "你好，抖音", "index": 1 }
                    }),
                    expected: ExpectedReceipt {
                        status: 200,
                        body: String::new(),
                        body_mode: "contains".into(),
                    },
                },
                StoredVersion {
                    revision: 2,
                    saved_at: "2026-09-12T02:00:00.000Z".into(),
                    payload: json!({
                        "event": "im_receive_msg",
                        "from_user_id": "ac6479a5-d7a6-4018-84be-c29bfc00000",
                        "custom_unknown_field": { "nested": [1, "two", null] },
                        "content": { "text": "你好，抖音（改）", "index": 2 }
                    }),
                    expected: ExpectedReceipt {
                        status: 200,
                        body: String::new(),
                        body_mode: "contains".into(),
                    },
                },
            ],
        }
    }

    #[test]
    fn roundtrips_events_with_unknown_fields_and_versions() {
        let dir = temp_dir("roundtrip");
        let events = vec![sample_event()];
        save_events(&dir, &events).unwrap();
        assert_eq!(load_events(&dir).unwrap(), events);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn missing_file_yields_empty_list() {
        let dir = temp_dir("missing");
        assert!(load_events(&dir).unwrap().is_empty());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn save_is_atomic_and_overwrites_previous_content() {
        let dir = temp_dir("atomic");
        save_events(&dir, &[sample_event()]).unwrap();
        let updated = StoredEvent {
            name: "新客问价 · 改名".into(),
            ..sample_event()
        };
        save_events(&dir, &[updated.clone()]).unwrap();
        assert_eq!(load_events(&dir).unwrap(), vec![updated]);
        // 原子写不留临时文件
        let entries: Vec<String> = fs::read_dir(&dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(entries, vec![FILE_NAME.to_string()]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn file_uses_camel_case_keys_for_frontend_contract() {
        let dir = temp_dir("camel");
        save_events(&dir, &[sample_event()]).unwrap();
        let raw = fs::read_to_string(events_file(&dir)).unwrap();
        assert!(raw.contains("\"channelId\""));
        assert!(raw.contains("\"schemaId\""));
        assert!(raw.contains("\"savedAt\""));
        assert!(!raw.contains("channel_id"));
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn payload_key_order_survives_roundtrip() {
        // serde_json 开启 preserve_order：载荷按键的文档序持久化往返，
        // 不被字母序重排——前端「逐字节确定拼装」跨重启成立的前提。
        let dir = temp_dir("order");
        let mut event = sample_event();
        event.versions[0].payload =
            json!({ "zebra": 1, "alpha": { "m": 2, "a": 1 } });
        save_events(&dir, &[event]).unwrap();

        let raw = fs::read_to_string(events_file(&dir)).unwrap();
        let zebra = raw.find("\"zebra\"").expect("缺少 zebra");
        let alpha = raw.find("\"alpha\"").expect("缺少 alpha");
        assert!(zebra < alpha, "顶层键按文档序持久化：{raw}");
        let m = raw.find("\"m\"").expect("缺少 m");
        let a = raw.find("\"a\"").expect("缺少 a");
        assert!(m < a, "嵌套键按文档序持久化：{raw}");

        let loaded = load_events(&dir).unwrap();
        let keys = loaded[0].versions[0]
            .payload
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect::<Vec<_>>();
        assert_eq!(keys, vec!["zebra", "alpha"]);
        fs::remove_dir_all(&dir).unwrap();
    }
}
