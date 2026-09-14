//! 执行器的命令接线与后台执行：两个 Tauri 命令薄壳（校验 → 公共启动体）
//! + 进度 emit 与落盘收尾 + 中断检查点。剧本运行在本边界包装成单 lane 编排
//! （内核只认 PlanRunSnapshot），运行形态决定进度事件与运行记录是否携带
//! lane 归属。编排编织内核见 super（mod.rs），快照与进度类型分别在
//! `crate::runs::snapshot` / `crate::runs::progress`。

use std::time::Duration;

use tauri::Emitter;

use crate::app_data_dir;
use crate::connections::ConnectionConfig;
use crate::plans::{PlanFailure, PlanMode};

use super::super::control;
use super::super::progress::{
    progress_event, LaneProgress, RunProgressEvent, RunProgressStatus, RUN_PROGRESS, StepProgress,
};
use super::super::snapshot::{validate_snapshot, PlanRunSnapshot, ScenarioRunSnapshot};
use super::super::store;
use super::super::{skipped_step, RunRecord};
use super::{execute_plan_cancellable, step_facts, tag_lane};

/// 运行形态（命令边界定死，内核不感知）：剧本运行 = 单 lane 编排的退化——
/// 进度事件不携带 lane、记录与步骤不落归属、来源字段为 scenario；
/// 编排运行保持 plan 形态（单 lane 编排也照常携带 lane，行为不变）。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum RunShape {
    Scenario,
    Plan,
}

impl RunShape {
    fn shape_record(self, record: RunRecord) -> RunRecord {
        match self {
            RunShape::Plan => record,
            RunShape::Scenario => scenario_shape(record),
        }
    }
}

/// 编排形态记录 → 剧本形态（单 lane 退化）：来源与归属字段还原。
/// 单 lane 包装把剧本身份放进 plan 字段（见 [`solo_plan`]），退化即原位还原。
pub(super) fn scenario_shape(mut record: RunRecord) -> RunRecord {
    record.source = "scenario".into();
    record.scenario_name = record.plan_name.take();
    for step in &mut record.steps {
        step.lane_index = None;
        step.lane_name = None;
    }
    record
}

/// Tauri 命令：后台线程执行剧本快照（单 lane 编排；进度经 run-progress
/// 事件回报且不携带 lane），完成后运行记录落 runs.json；命令立即返回 run id。
#[tauri::command]
pub async fn start_scenario_run(
    app: tauri::AppHandle,
    snapshot: ScenarioRunSnapshot,
    connections: Vec<ConnectionConfig>,
) -> Result<String, String> {
    launch_run(app, solo_plan(snapshot), connections, RunShape::Scenario).await
}

/// Tauri 命令：后台线程执行编排快照（进度带 lane 经 run-progress 事件回报），
/// 完成后运行记录落 runs.json；命令立即返回 run id。
#[tauri::command]
pub async fn start_plan_run(
    app: tauri::AppHandle,
    snapshot: PlanRunSnapshot,
    connections: Vec<ConnectionConfig>,
) -> Result<String, String> {
    launch_run(app, snapshot, connections, RunShape::Plan).await
}

/// 公共启动体（两个命令薄壳共用，与 connections_test 命令同款「薄壳 + 公共体」）：
/// 校验快照 → 登记运行 → 落中断检查点 → 阻塞线程起跑后台执行。
async fn launch_run(
    app: tauri::AppHandle,
    snapshot: PlanRunSnapshot,
    connections: Vec<ConnectionConfig>,
    shape: RunShape,
) -> Result<String, String> {
    for scenario in &snapshot.scenarios {
        validate_snapshot(scenario)?;
    }
    let run_id = snapshot.run_id.clone();
    let active = control::register(&run_id)?;
    let checkpoint = interrupted_plan_record(&snapshot, &connections, shape);
    let dir = app_data_dir(&app)?;
    store::upsert_run(&dir, checkpoint.clone())
        .map_err(|error| format!("无法保存运行快照：{error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        run_in_background(app, snapshot, connections, active, dir, checkpoint, shape);
    });
    Ok(run_id)
}

/// 剧本运行的编排形态：单 lane PlanRunSnapshot（lane 语义上，剧本运行 =
/// 只有一个剧本的编排）。剧本身份暂存 plan 字段，收尾经 [`scenario_shape`]
/// 还原。failure 取 Continue（中性）：编排层不追加语义——剧内失败策略仍由
/// 快照 failure 裁决（`LanePolicy::serial` 退化即单剧本决策表，无旗标无 halt）。
pub(super) fn solo_plan(snapshot: ScenarioRunSnapshot) -> PlanRunSnapshot {
    PlanRunSnapshot {
        run_id: snapshot.run_id.clone(),
        plan_id: snapshot.scenario_id.clone(),
        plan_name: snapshot.scenario_name.clone(),
        mode: PlanMode::Serial,
        failure: PlanFailure::Continue,
        started_at: snapshot.started_at.clone(),
        scenarios: vec![snapshot],
    }
}

/// 后台执行：进度经 run-progress 事件回报（编排带 lane，剧本退化不带），
/// 完成后运行记录落 runs.json，并发一条 finished 事件携带完整记录（前端入列）。
fn run_in_background(
    app: tauri::AppHandle,
    snapshot: PlanRunSnapshot,
    connections: Vec<ConnectionConfig>,
    active: control::ActiveRun,
    dir: std::path::PathBuf,
    mut checkpoint: RunRecord,
    shape: RunShape,
) {
    let solo = shape == RunShape::Scenario;
    let run = execute_plan_cancellable(
        &snapshot,
        &connections,
        Duration::from_secs(5),
        &active.cancelled,
        &mut |lane_progress: LaneProgress| {
            let lane = lane_progress.lane;
            let mut event = progress_event(
                &snapshot.run_id,
                (!solo).then_some(lane),
                &lane_progress.progress,
            );
            if let StepProgress::Finished { index, step, .. } = &lane_progress.progress {
                // 回执覆盖检查点：lane 内步骤下标平铺为记录内下标（单 lane 偏移恒 0）
                let offset: usize = snapshot.scenarios[..lane]
                    .iter()
                    .map(|scenario| scenario.steps.len())
                    .sum();
                let step = step.clone();
                checkpoint.steps[offset + index] = if solo {
                    step
                } else {
                    tag_lane(step, lane, &snapshot.scenarios[lane].scenario_name)
                };
                event.error = store::upsert_run(&dir, checkpoint.clone())
                    .err()
                    .map(|error| error.to_string());
            }
            let _ = app.emit(RUN_PROGRESS, event);
        },
    );
    drop(active);
    finish_run(app, snapshot.run_id, shape.shape_record(run));
}

/// 运行记录落盘失败会随完成事件返回，前端保留快照并提供重试。
fn finish_run(app: tauri::AppHandle, run_id: String, run: RunRecord) {
    let saved = (|| -> Result<(), String> {
        let dir = app_data_dir(&app)?;
        store::upsert_run(&dir, run.clone())
            .map(|_| ())
            .map_err(|error| error.to_string())
    })();
    let _ = app.emit(
        RUN_PROGRESS,
        RunProgressEvent {
            error: saved.err(),
            run_id,
            index: run.steps.len(),
            status: RunProgressStatus::Finished,
            lane: None,
            step: None,
            run: Some(run),
        },
    );
}

/// 启动前先保存中断态；每步回执覆盖对应步骤，正常结束再写最终状态。
/// 若进程退出，重启可追溯已完成的步骤且不会自动续发。
pub(super) fn interrupted_plan_record(
    snapshot: &PlanRunSnapshot,
    connections: &[ConnectionConfig],
    shape: RunShape,
) -> RunRecord {
    let record = RunRecord {
        id: snapshot.run_id.clone(),
        started_at: snapshot.started_at.clone(),
        source: "plan".into(),
        scenario_name: None,
        plan_name: Some(snapshot.plan_name.clone()),
        source_id: Some(snapshot.plan_id.clone()),
        mode: Some(snapshot.mode),
        cancelled: true,
        steps: snapshot
            .scenarios
            .iter()
            .enumerate()
            .flat_map(|(lane, scenario)| {
                scenario.steps.iter().map(move |step| {
                    tag_lane(
                        skipped_step(
                            Some(&step.expected),
                            step_facts(step, connections),
                            "运行中断，本步骤未完成",
                        ),
                        lane,
                        &scenario.scenario_name,
                    )
                })
            })
            .collect(),
    };
    shape.shape_record(record)
}
