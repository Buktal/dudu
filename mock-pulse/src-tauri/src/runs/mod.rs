//! 运行记录域：直发/剧本运行的本地持久化 + Tauri 命令。
//! Run = 一次运行的步骤快照（载荷明文、签名头、回执、比对结论），
//! 来源事件即使后续被修改，快照也不变。

pub mod store;

use serde::{Deserialize, Serialize};
use tauri::Manager;

/// 回执事实：HTTP 状态（0 = 未收到响应）、耗时与原始回执文本。
/// reply = 企微加密被动回复解密后的明文（旧记录/其他渠道为 None）。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReceiptSnapshot {
    pub status: u16,
    pub elapsed_ms: u64,
    pub body: String,
    #[serde(default)]
    pub reply: Option<String>,
    pub error: Option<String>,
}

/// 期望比对结论。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RunVerdict {
    pub passed: bool,
    pub reason: String,
}

/// 运行中的一个步骤快照（直发 = 单步 Run）。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RunStep {
    /// 来源事件的名称快照
    pub event_name: String,
    /// 来源事件 id（草稿未保存时也保留其 id）
    pub event_id: String,
    pub channel: String,
    /// 发送目标地址快照
    pub url: String,
    /// 发出的明文载荷快照（逐字节与发送一致；企微为加密前的明文 XML）
    pub payload: String,
    /// 签名快照：抖音 X-Douyin-Signature 头 / 企微 msg_signature 查询参数
    pub signature: String,
    /// 发送唯一标识快照：抖音 Msg-Id 头 / 企微 nonce
    pub msg_id: String,
    /// 企微 msg_signature 的时间戳（旧记录/抖音为 None）
    #[serde(default)]
    pub timestamp: Option<String>,
    pub receipt: ReceiptSnapshot,
    pub verdict: RunVerdict,
}

/// 一条运行记录。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RunRecord {
    pub id: String,
    /// 启动时间（ISO）
    pub started_at: String,
    /// 来源：direct = 事件直发；剧本/编排运行在后续票扩展
    pub source: String,
    pub steps: Vec<RunStep>,
}

fn app_data_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().app_data_dir().map_err(|err| err.to_string())
}

/// 读取全部运行记录（无文件时返回空列表）。
#[tauri::command]
pub fn runs_load(app: tauri::AppHandle) -> Result<Vec<RunRecord>, String> {
    let dir = app_data_dir(&app)?;
    store::load_runs(&dir).map_err(|err| err.to_string())
}

/// 追加一条运行记录并持久化，返回保存后的完整列表（时间升序）。
#[tauri::command]
pub fn runs_save(
    app: tauri::AppHandle,
    run: RunRecord,
) -> Result<Vec<RunRecord>, String> {
    let dir = app_data_dir(&app)?;
    let mut list = store::load_runs(&dir).map_err(|err| err.to_string())?;
    list.push(run);
    store::save_runs(&dir, &list).map_err(|err| err.to_string())?;
    Ok(list)
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(super) fn sample_run(id: &str) -> RunRecord {
        RunRecord {
            id: id.into(),
            started_at: format!("2026-09-12T01:00:0{id}.000Z"),
            source: "direct".into(),
            steps: vec![RunStep {
                event_name: "新客问价".into(),
                event_id: "evt-001".into(),
                channel: "douyin".into(),
                url: "http://127.0.0.1:8080/webhooks/douyin".into(),
                payload: r#"{"event":"im_receive_msg","content":{"text":"你好，抖音"}}"#.into(),
                signature: "a".repeat(40),
                msg_id: "0f8c1b2a-3d4e-4f5a-9b8c-7d6e5f4a3b2c".into(),
                timestamp: None,
                receipt: ReceiptSnapshot {
                    status: 200,
                    elapsed_ms: 12,
                    body: "{\"code\":0}".into(),
                    reply: None,
                    error: None,
                },
                verdict: RunVerdict {
                    passed: true,
                    reason: "HTTP 200，与期望状态一致".into(),
                },
            }],
        }
    }

    #[test]
    fn run_record_serializes_camel_case_for_frontend() {
        let raw = serde_json::to_string(&sample_run("run-1")).unwrap();
        assert!(raw.contains("\"startedAt\""));
        assert!(raw.contains("\"eventId\""));
        assert!(raw.contains("\"msgId\""));
        assert!(raw.contains("\"elapsedMs\""));
        assert!(raw.contains("\"reply\""));
        assert!(!raw.contains("started_at"));
        assert!(!raw.contains("elapsed_ms"));
    }

    #[test]
    fn run_record_deserializes_legacy_records_without_new_fields() {
        // 旧版持久化记录没有 reply/timestamp 字段：反序列化为 None，不丢数据
        let raw = serde_json::json!({
            "id": "run-old",
            "startedAt": "2026-09-01T00:00:00.000Z",
            "source": "direct",
            "steps": [{
                "eventName": "旧记录",
                "eventId": "evt-old",
                "channel": "douyin",
                "url": "http://127.0.0.1:8080/hook",
                "payload": "{}",
                "signature": "a".repeat(40),
                "msgId": "m-1",
                "receipt": {
                    "status": 200,
                    "elapsedMs": 5,
                    "body": "ok",
                    "error": null
                },
                "verdict": { "passed": true, "reason": "ok" }
            }]
        })
        .to_string();
        let record: RunRecord = serde_json::from_str(&raw).unwrap();
        assert_eq!(record.steps[0].timestamp, None);
        assert_eq!(record.steps[0].receipt.reply, None);
        assert_eq!(record.steps[0].msg_id, "m-1");
    }
}
