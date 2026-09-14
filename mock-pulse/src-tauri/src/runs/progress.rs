//! run-progress 事件 seam 单点：进度类型、事件名常量与 emit 侧载荷构造。
//! 执行器（executor）执行步骤时产出 [`StepProgress`]，本模块把它投影成
//! 与前端 slice 的 onRunProgress 对齐的 camelCase 载荷（["RunProgressEvent"]）——
//! 事件名与 status 字面量只在这里出现一次，前端契约改向时单点可循。

use serde::Serialize;

use super::{RunRecord, RunStep};

/// run-progress 事件名（emit 侧唯一出处，前端 addTauriListener 同名）。
pub(crate) const RUN_PROGRESS: &str = "run-progress";

/// 执行进度（经回调注入：Tauri 命令接 emit，cargo 测试接收集器）。
#[derive(Clone, Debug, PartialEq)]
pub enum StepProgress {
    /// 步骤开始发送
    Waiting { index: usize },
    /// 步骤发送完成（failed = 发送错误或与期望不符）
    Finished {
        index: usize,
        step: RunStep,
        failed: bool,
    },
    /// 前序失败，本步骤不发送
    Skipped { index: usize },
}

/// 编排执行进度：带 lane 归属的步骤进度（lane = 快照内 scenarios 下标）。
#[derive(Clone, Debug, PartialEq)]
pub struct LaneProgress {
    pub lane: usize,
    pub progress: StepProgress,
}

/// 步骤状态（run-progress 的 status 字段）：小写序列化，
/// 与前端 TS 联合类型 "waiting" | "success" | "failed" | "skipped" | "finished" 一致。
#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum RunProgressStatus {
    Waiting,
    Success,
    Failed,
    Skipped,
    Finished,
}

/// run-progress 事件载荷（camelCase，与前端 slice 的 onRunProgress 对齐）。
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RunProgressEvent {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub run_id: String,
    pub index: usize,
    /// waiting | success | failed | skipped | finished
    pub status: RunProgressStatus,
    /// 编排运行：进度所属 lane 序号（剧本运行/finished 缺省不序列化）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lane: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub step: Option<RunStep>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run: Option<RunRecord>,
}

/// 把 StepProgress 转成 run-progress 事件载荷。
pub(crate) fn progress_event(
    run_id: &str,
    lane: Option<usize>,
    progress: &StepProgress,
) -> RunProgressEvent {
    let base = match progress {
        StepProgress::Waiting { index } => (*index, RunProgressStatus::Waiting, None),
        StepProgress::Finished {
            index,
            step,
            failed,
        } => (
            *index,
            if *failed {
                RunProgressStatus::Failed
            } else {
                RunProgressStatus::Success
            },
            Some(step.clone()),
        ),
        StepProgress::Skipped { index } => (*index, RunProgressStatus::Skipped, None),
    };
    RunProgressEvent {
        error: None,
        run_id: run_id.into(),
        index: base.0,
        status: base.1,
        lane,
        step: base.2,
        run: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_event_serializes_camel_case_for_frontend() {
        let event = progress_event(
            "run-1",
            None,
            &StepProgress::Finished {
                index: 2,
                step: super::super::tests::sample_run("run-1").steps[0].clone(),
                failed: false,
            },
        );
        let raw = serde_json::to_string(&event).unwrap();
        assert!(raw.contains("\"runId\""));
        assert!(raw.contains("\"status\":\"success\""));
        assert!(raw.contains("\"eventName\""));
        assert!(!raw.contains("run_id"));
        // 剧本运行没有 lane 归属：字段整体不序列化
        assert!(!raw.contains("\"lane\""));

        // 编排运行：进度带 lane 序号（camelCase），None 时仍不序列化
        let lane_event = progress_event("run-1", Some(1), &StepProgress::Waiting { index: 0 });
        let raw = serde_json::to_string(&lane_event).unwrap();
        assert!(raw.contains("\"lane\":1"));
        assert!(raw.contains("\"status\":\"waiting\""));
        assert!(!raw.contains("\"step\""));

        let finished = RunProgressEvent {
            error: None,
            run_id: "run-1".into(),
            index: 1,
            status: RunProgressStatus::Finished,
            lane: None,
            step: None,
            run: Some(super::super::tests::sample_run("run-1")),
        };
        let raw = serde_json::to_string(&finished).unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&raw).unwrap()["run"]["id"],
            "run-1"
        );
        assert!(raw.contains("\"status\":\"finished\""));
        assert!(!raw.contains("\"step\""));
        assert!(!raw.contains("\"lane\""));
    }

    #[test]
    fn status_enum_covers_frontend_union_verbatim() {
        // 五值逐字对齐前端 LiveStepStatus/RunProgressPayload 的联合类型
        let cases = [
            (RunProgressStatus::Waiting, "\"waiting\""),
            (RunProgressStatus::Success, "\"success\""),
            (RunProgressStatus::Failed, "\"failed\""),
            (RunProgressStatus::Skipped, "\"skipped\""),
            (RunProgressStatus::Finished, "\"finished\""),
        ];
        for (status, literal) in cases {
            assert_eq!(serde_json::to_string(&status).unwrap(), literal);
        }
    }
}
