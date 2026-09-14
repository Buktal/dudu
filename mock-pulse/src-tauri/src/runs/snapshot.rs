//! 运行快照类型（纯数据）与启动前校验：Rust 不感知素材库/剧本概念，
//! 只执行前端 materializeRunSnapshot / materializePlanRun 产出的快照。
//! policy 与 executor 都消费本模块——快照类型不落在 executor 内，
//! runs 域内依赖方向为 policy/executor → snapshot，无回环。

use serde::{Deserialize, Serialize};

use crate::plans::{PlanFailure, PlanMode};

use super::verdict::ExpectedReceipt;

/// 快照中的一个步骤（前端 materializeRunSnapshot 产出）。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioStepSnapshot {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub wait: Option<f64>,
    pub event_name: String,
    pub event_id: String,
    /// 抖音 | 企微对应的渠道标识（douyin/wecom）
    pub channel: String,
    pub expected: ExpectedReceipt,
    /// 前端逐字节拼装好的明文载荷（wireBodyText 产出）
    pub body: String,
}

/// 一次剧本运行的完整快照（纯数据，启动时固化，后续编辑不影响）。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioRunSnapshot {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub failure: Option<String>,
    pub run_id: String,
    pub scenario_id: String,
    pub scenario_name: String,
    /// 启动时间（ISO，前端生成）
    pub started_at: String,
    pub steps: Vec<ScenarioStepSnapshot>,
}

/// 一次编排运行的完整快照：每个 lane = 一个已物化的剧本运行快照
/// （前端 materializePlanRun 产出，启动时固化）。mode/failure 与编排文档一致。
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlanRunSnapshot {
    pub run_id: String,
    pub plan_id: String,
    pub plan_name: String,
    pub mode: PlanMode,
    pub failure: PlanFailure,
    /// 启动时间（ISO，前端生成）
    pub started_at: String,
    /// lanes（有序）：每个剧本一份运行快照
    pub scenarios: Vec<ScenarioRunSnapshot>,
}

/// 启动前校验：非空步骤 + 等待范围 + 失败策略取值（前端已校验，此处契约兜底）。
pub(crate) fn validate_snapshot(snapshot: &ScenarioRunSnapshot) -> Result<(), String> {
    if snapshot.steps.is_empty() {
        return Err("剧本还没有步骤。".into());
    }
    if snapshot.steps.iter().any(|step| {
        step.wait
            .is_some_and(|wait| !wait.is_finite() || !(0.0..=60.0).contains(&wait))
    }) {
        return Err("发送前等待须为 0 到 60 秒。".into());
    }
    if snapshot
        .failure
        .as_deref()
        .is_some_and(|failure| failure != "stop" && failure != "continue")
    {
        return Err("无效的步骤失败策略。".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn step(wait: Option<f64>) -> ScenarioStepSnapshot {
        ScenarioStepSnapshot {
            wait,
            event_name: "进入会话".into(),
            event_id: "evt-1".into(),
            channel: "douyin".into(),
            expected: ExpectedReceipt {
                status: 200,
                body: String::new(),
                body_mode: crate::runs::verdict::ReceiptBodyMode::Contains,
            },
            body: "{}".into(),
        }
    }

    fn snapshot(steps: Vec<ScenarioStepSnapshot>) -> ScenarioRunSnapshot {
        ScenarioRunSnapshot {
            failure: None,
            run_id: "run-validate".into(),
            scenario_id: "scn-1".into(),
            scenario_name: "校验样本".into(),
            started_at: "2026-09-12T02:00:00.000Z".into(),
            steps,
        }
    }

    #[test]
    fn accepts_nonempty_steps_with_valid_wait_and_failure() {
        let mut snap = snapshot(vec![step(Some(0.0)), step(None)]);
        snap.failure = Some("continue".into());
        assert_eq!(validate_snapshot(&snap), Ok(()));
    }

    #[test]
    fn rejects_empty_steps_and_out_of_range_wait() {
        assert_eq!(
            validate_snapshot(&snapshot(Vec::new())),
            Err("剧本还没有步骤。".into())
        );
        assert_eq!(
            validate_snapshot(&snapshot(vec![step(Some(60.1))])),
            Err("发送前等待须为 0 到 60 秒。".into())
        );
        // 非有限值（NaN/无穷）同样落在 0..=60 之外
        assert!(validate_snapshot(&snapshot(vec![step(Some(f64::NAN))])).is_err());
    }

    #[test]
    fn rejects_unknown_failure_policy_value() {
        let mut snap = snapshot(vec![step(None)]);
        snap.failure = Some("retry".into());
        assert_eq!(
            validate_snapshot(&snap),
            Err("无效的步骤失败策略。".into())
        );
    }

    #[test]
    fn snapshots_roundtrip_through_frontend_camel_case() {
        let plan = PlanRunSnapshot {
            run_id: "run-plan".into(),
            plan_id: "plan-1".into(),
            plan_name: "双平台接待回归".into(),
            mode: PlanMode::Parallel,
            failure: PlanFailure::Stop,
            started_at: "2026-09-12T04:00:00.000Z".into(),
            scenarios: vec![snapshot(vec![step(Some(1.5))])],
        };
        let raw = serde_json::to_string(&plan).unwrap();
        assert!(raw.contains("\"runId\""));
        assert!(raw.contains("\"scenarioName\""));
        assert!(raw.contains("\"eventId\""));
        assert!(raw.contains("\"bodyMode\""));
        assert!(!raw.contains("scenario_name"));
        let back: PlanRunSnapshot = serde_json::from_str(&raw).unwrap();
        assert_eq!(back, plan);
    }
}
