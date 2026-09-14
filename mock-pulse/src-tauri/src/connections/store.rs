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
        let configs = vec![
            ConnectionConfig::Douyin {
                url: "http://127.0.0.1:8080/webhooks/douyin".into(),
                system: super::super::DouyinSystem::Dop,
                client_key: "tt_key".into(),
                client_secret: "tt_secret".into(),
                mini_game_token: String::new(),
                isv_token: String::new(),
                isv_key: String::new(),
            },
            ConnectionConfig::Wecom {
                url: "http://127.0.0.1:8080/webhooks/wecom".into(),
                system: super::super::WecomSystem::Agent,
                corp_id: "wx5823bf96d3bd56c7".into(),
                token: "QDG6eK".into(),
                encoding_aes_key: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C".into(),
                agent_id: "218".into(),
            },
        ];
        save_connections(&dir, &configs).unwrap();
        assert!(connections_file(&dir).exists());
        assert_eq!(load_connections(&dir).unwrap(), configs);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn deserializes_legacy_douyin_only_file() {
        // #14–#16 旧版写盘形状（平铺 struct + channel 字段）必须原样可读（向后兼容）；
        // #30 体系字段缺省：无 system 时按 dop、体系凭据按空串落位
        let dir = temp_dir("legacy");
        let legacy = r#"[{"channel":"douyin","url":"http://localhost/hook","clientKey":"k","clientSecret":"s"}]"#;
        fs::write(
            connections_file(&dir),
            legacy,
        )
        .unwrap();
        assert_eq!(
            load_connections(&dir).unwrap(),
            vec![ConnectionConfig::Douyin {
                url: "http://localhost/hook".into(),
                system: super::super::DouyinSystem::Dop,
                client_key: "k".into(),
                client_secret: "s".into(),
                mini_game_token: String::new(),
                isv_token: String::new(),
                isv_key: String::new(),
            }]
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn deserializes_douyin_system_tag_and_system_credentials() {
        // #30 体系内标：snake_case 序列化（dop/mini_game/isv）与体系凭据各自落位
        let dir = temp_dir("system");
        let raw = r#"[{"channel":"douyin","url":"http://localhost/push","system":"mini_game","clientKey":"tt12321","clientSecret":"","miniGameToken":"mg_token","isvToken":"","isvKey":""}]"#;
        fs::write(connections_file(&dir), raw).unwrap();
        assert_eq!(
            load_connections(&dir).unwrap(),
            vec![ConnectionConfig::Douyin {
                url: "http://localhost/push".into(),
                system: super::super::DouyinSystem::MiniGame,
                client_key: "tt12321".into(),
                client_secret: String::new(),
                mini_game_token: "mg_token".into(),
                isv_token: String::new(),
                isv_key: String::new(),
            }]
        );
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn wecom_system_tag_routes_agent_and_aibot_channels() {
        // #31 通道内标：snake_case 序列化（agent/aibot），缺省 agent 兼容旧数据
        let dir = temp_dir("wecom-system");
        let raw = r#"[
            {"channel":"wecom","url":"http://localhost/xml","corpId":"ww_xml","token":"t","encodingAesKey":"a","agentId":"1"},
            {"channel":"wecom","url":"http://localhost/json","system":"aibot","corpId":"","token":"t2","encodingAesKey":"b","agentId":""}
        ]"#;
        fs::write(connections_file(&dir), raw).unwrap();
        assert_eq!(
            load_connections(&dir).unwrap(),
            vec![
                ConnectionConfig::Wecom {
                    url: "http://localhost/xml".into(),
                    // 无 system 字段：按 agent 落位（#27–#30 旧版数据形状）
                    system: super::super::WecomSystem::Agent,
                    corp_id: "ww_xml".into(),
                    token: "t".into(),
                    encoding_aes_key: "a".into(),
                    agent_id: "1".into(),
                },
                ConnectionConfig::Wecom {
                    url: "http://localhost/json".into(),
                    system: super::super::WecomSystem::Aibot,
                    corp_id: String::new(),
                    token: "t2".into(),
                    encoding_aes_key: "b".into(),
                    agent_id: String::new(),
                },
            ]
        );
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
        let configs = vec![
            ConnectionConfig::Douyin {
                url: "http://localhost/hook".into(),
                system: super::super::DouyinSystem::LifeService,
                client_key: "k".into(),
                client_secret: "s".into(),
                mini_game_token: String::new(),
                isv_token: String::new(),
                isv_key: String::new(),
            },
            ConnectionConfig::Wecom {
                url: "http://localhost/wecom".into(),
                system: super::super::WecomSystem::Aibot,
                corp_id: "ww_corp".into(),
                token: "t".into(),
                encoding_aes_key: "a".repeat(43),
                agent_id: "1000002".into(),
            },
        ];
        save_connections(&dir, &configs).unwrap();
        let raw = fs::read_to_string(connections_file(&dir)).unwrap();
        assert!(raw.contains("\"channel\": \"douyin\""));
        assert!(raw.contains("\"channel\": \"wecom\""));
        assert!(raw.contains("\"system\": \"life_service\""));
        assert!(raw.contains("\"clientKey\""));
        assert!(raw.contains("\"clientSecret\""));
        assert!(raw.contains("\"corpId\""));
        assert!(raw.contains("\"encodingAesKey\""));
        assert!(raw.contains("\"agentId\""));
        assert!(!raw.contains("client_key"));
        assert!(!raw.contains("corp_id"));
        fs::remove_dir_all(&dir).unwrap();
    }
}
