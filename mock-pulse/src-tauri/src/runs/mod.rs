//! 运行记录域：直发/剧本运行的本地持久化 + Tauri 命令。
//! Run = 一次运行的步骤快照（载荷明文、签名头、回执、比对结论），
//! 来源事件即使后续被修改，快照也不变。

pub mod control;
pub mod executor;
pub mod policy;
pub mod store;
pub mod verdict;

use serde::{Deserialize, Serialize};
use tauri::Manager;

use crate::connections::{douyin, wecom};

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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expected: Option<verdict::ExpectedReceipt>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request_body: Option<String>,
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
    /// 剧本运行失败即停：失败步之后的步骤不发送（旧记录缺省 false）
    #[serde(default)]
    pub skipped: bool,
    /// 编排运行：本步骤所属 lane 序号（直发/剧本运行/旧记录缺省 None）
    #[serde(default)]
    pub lane_index: Option<usize>,
    /// 编排运行：本步骤所属剧本名快照（直发/剧本运行/旧记录缺省 None）
    #[serde(default)]
    pub lane_name: Option<String>,
}

/// 一条运行记录。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RunRecord {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<crate::plans::PlanMode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source_id: Option<String>,
    #[serde(default)]
    pub cancelled: bool,
    pub id: String,
    /// 启动时间（ISO）
    pub started_at: String,
    /// 来源：direct = 事件直发；scenario = 剧本运行
    pub source: String,
    /// 来源剧本名快照（直发记录/旧记录为 None）
    #[serde(default)]
    pub scenario_name: Option<String>,
    /// 来源编排名快照（编排运行记录才有；直发/剧本运行/旧记录为 None）
    #[serde(default)]
    pub plan_name: Option<String>,
    pub steps: Vec<RunStep>,
}

/// 渠道协议发送结果 → 回执快照（抖音无解密被动回复，reply 恒空）。
pub(crate) fn receipt_from_douyin(outcome: &douyin::DispatchOutcome) -> ReceiptSnapshot {
    ReceiptSnapshot {
        status: outcome.status,
        elapsed_ms: outcome.elapsed_ms,
        body: outcome.body.clone(),
        reply: None,
        error: outcome.error.clone(),
    }
}

/// 企微协议发送结果 → 回执快照（reply = 加密被动回复解密后的明文）。
pub(crate) fn receipt_from_wecom(outcome: &wecom::WecomDispatchOutcome) -> ReceiptSnapshot {
    ReceiptSnapshot {
        status: outcome.status,
        elapsed_ms: outcome.elapsed_ms,
        body: outcome.body.clone(),
        reply: outcome.reply.clone(),
        error: outcome.error.clone(),
    }
}

/// 已发送（或已尝试发送）步骤的唯一构造入口：回执经期望比对出结论，
/// 渠道协议要素与载荷快照一次成形——执行器（executor）与直发命令（sends）
/// 共用，保证两条产路的字段落点一致。expected 为 None（UI 不会产生，
/// 契约兜底）时不做比对，仅记录回执。
pub(crate) fn sent_step(
    expected: Option<&verdict::ExpectedReceipt>,
    event_name: String,
    event_id: String,
    channel: &str,
    url: String,
    payload: String,
    request_body: Option<String>,
    signature: String,
    msg_id: String,
    timestamp: Option<String>,
    receipt: ReceiptSnapshot,
) -> RunStep {
    let verdict = match expected {
        Some(expected) => verdict::compare_receipt(expected, &receipt),
        None => RunVerdict {
            passed: true,
            reason: "未设期望，仅记录回执".into(),
        },
    };
    RunStep {
        expected: expected.cloned(),
        request_body,
        event_name,
        event_id,
        channel: channel.into(),
        url,
        payload,
        signature,
        msg_id,
        timestamp,
        receipt,
        verdict,
        skipped: false,
        lane_index: None,
        lane_name: None,
    }
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
pub fn runs_save(app: tauri::AppHandle, run: RunRecord) -> Result<Vec<RunRecord>, String> {
    let dir = app_data_dir(&app)?;
    store::upsert_run(&dir, run).map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    pub(super) fn sample_run(id: &str) -> RunRecord {
        RunRecord {
            mode: None,
            source_id: None,
            cancelled: false,
            id: id.into(),
            started_at: format!("2026-09-12T01:00:0{id}.000Z"),
            source: "direct".into(),
            scenario_name: None,
            steps: vec![RunStep {
                expected: None,
                request_body: None,
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
                skipped: false,
                lane_index: None,
                lane_name: None,
            }],
            plan_name: None,
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
        // 旧记录没有 skipped/scenarioName 字段：默认 false/None
        assert!(!record.steps[0].skipped);
        assert_eq!(record.scenario_name, None);
        // 旧记录没有 planName/laneIndex/laneName 字段：默认 None（编排字段向后兼容）
        assert_eq!(record.plan_name, None);
        assert_eq!(record.steps[0].lane_index, None);
        assert_eq!(record.steps[0].lane_name, None);
    }

    /// 剧本运行记录：多步 + 失败步骤后 skipped + 剧本名快照。
    fn scenario_run(id: &str) -> RunRecord {
        let failed_step = RunStep {
            expected: None,
            request_body: None,
            event_name: "进入会话".into(),
            event_id: "evt-2".into(),
            channel: "douyin".into(),
            url: "http://127.0.0.1:8080/webhooks/douyin".into(),
            payload: r#"{"event":"im_receive_msg"}"#.into(),
            signature: "b".repeat(40),
            msg_id: "m-2".into(),
            timestamp: None,
            receipt: ReceiptSnapshot {
                status: 500,
                elapsed_ms: 20,
                body: "boom".into(),
                reply: None,
                error: None,
            },
            verdict: RunVerdict {
                passed: false,
                reason: "HTTP 500，期望 HTTP 200".into(),
            },
            skipped: false,
            lane_index: None,
            lane_name: None,
        };
        let skipped_step = RunStep {
            expected: None,
            request_body: None,
            event_name: "新客问价".into(),
            event_id: "evt-3".into(),
            channel: "douyin".into(),
            url: "http://127.0.0.1:8080/webhooks/douyin".into(),
            payload: r#"{"event":"im_message_read"}"#.into(),
            signature: String::new(),
            msg_id: String::new(),
            timestamp: None,
            receipt: ReceiptSnapshot {
                status: 0,
                elapsed_ms: 0,
                body: String::new(),
                reply: None,
                error: None,
            },
            verdict: RunVerdict {
                passed: false,
                reason: "前序步骤失败，本步骤未执行".into(),
            },
            skipped: true,
            lane_index: None,
            lane_name: None,
        };
        RunRecord {
            mode: None,
            source_id: None,
            cancelled: false,
            id: id.into(),
            started_at: "2026-09-12T02:00:00.000Z".into(),
            source: "scenario".into(),
            scenario_name: Some("从进入会话到商品咨询".into()),
            plan_name: None,
            steps: vec![sample_run(id).steps[0].clone(), failed_step, skipped_step],
        }
    }

    #[test]
    fn scenario_run_record_serializes_camel_case_with_skipped() {
        let raw = serde_json::to_string(&scenario_run("run-scn")).unwrap();
        assert!(raw.contains("\"source\":\"scenario\""));
        assert!(raw.contains("\"scenarioName\":\"从进入会话到商品咨询\""));
        assert!(raw.contains("\"skipped\":true"));
        assert!(!raw.contains("scenario_name"));
    }

    #[test]
    fn scenario_run_record_roundtrips_multi_step_with_skipped() {
        let record = scenario_run("run-scn");
        let raw = serde_json::to_string(&record).unwrap();
        let back: RunRecord = serde_json::from_str(&raw).unwrap();
        assert_eq!(back, record);
        assert_eq!(back.steps.len(), 3);
        assert!(back.steps[2].skipped);
        assert_eq!(back.scenario_name.as_deref(), Some("从进入会话到商品咨询"));
    }

    /// 编排运行记录：source = plan、planName 快照、步骤带 lane 归属。
    fn plan_run(id: &str) -> RunRecord {
        let mut step = sample_run(id).steps[0].clone();
        step.lane_index = Some(1);
        step.lane_name = Some("企微接待".into());
        RunRecord {
            mode: None,
            source_id: None,
            cancelled: false,
            id: id.into(),
            started_at: "2026-09-12T03:00:00.000Z".into(),
            source: "plan".into(),
            scenario_name: None,
            plan_name: Some("双平台接待回归".into()),
            steps: vec![step],
        }
    }

    #[test]
    fn plan_run_record_serializes_camel_case_with_lane_fields() {
        let raw = serde_json::to_string(&plan_run("run-plan")).unwrap();
        assert!(raw.contains("\"source\":\"plan\""));
        assert!(raw.contains("\"planName\":\"双平台接待回归\""));
        assert!(raw.contains("\"laneIndex\":1"));
        assert!(raw.contains("\"laneName\":\"企微接待\""));
        assert!(!raw.contains("lane_index"));
        assert!(!raw.contains("plan_name"));
        // 非编排记录：编排字段以 null 序列化（与 skipped=false 同风格，旧前端可忽略）
        let raw = serde_json::to_string(&sample_run("run-1")).unwrap();
        assert!(raw.contains("\"planName\":null"));
        assert!(raw.contains("\"laneIndex\":null"));
        assert!(raw.contains("\"laneName\":null"));
    }

    #[test]
    fn plan_run_record_roundtrips_with_lane_fields() {
        let record = plan_run("run-plan");
        let raw = serde_json::to_string(&record).unwrap();
        let back: RunRecord = serde_json::from_str(&raw).unwrap();
        assert_eq!(back, record);
        assert_eq!(back.steps[0].lane_index, Some(1));
        assert_eq!(back.steps[0].lane_name.as_deref(), Some("企微接待"));
        assert_eq!(back.plan_name.as_deref(), Some("双平台接待回归"));
    }
}
