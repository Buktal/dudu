//! 生命周期语义：用户取消打断等待、剧本 continue 记录后继续、编排 stop 覆盖
//! 剧本 continue、用户停止贯穿串/并行编排、中断检查点落盘往返、检查点回执
//! 回写（checkpoint patch / write）的落位与落盘。

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use crate::plans::{PlanFailure, PlanMode};
use crate::runs::progress::StepProgress;
use crate::runs::snapshot::ScenarioFailure;

use super::*;

#[test]
fn cancellation_during_wait_skips_all_remaining_requests() {
    let cancelled = AtomicBool::new(false);
    let mut first = dy_step("first", "first");
    first.wait = Some(60.0);
    let snap = snapshot("cancel-wait", vec![first, dy_step("next", "next")]);
    let started = Instant::now();
    let run = super::run_scenario_cancellable(
        &snap,
        &[],
        Duration::from_secs(1),
        &cancelled,
        &mut |progress| {
            if matches!(progress, StepProgress::Waiting { index: 0 }) {
                cancelled.store(true, Ordering::SeqCst);
            }
        },
    );
    assert!(started.elapsed() < Duration::from_secs(1));
    assert!(run.cancelled);
    assert!(run
        .steps
        .iter()
        .all(|step| step.skipped && step.signature.is_empty()));
}

#[test]
fn scenario_continue_attempts_later_steps_after_failure() {
    let mut snap = snapshot("continue", vec![dy_step("a", "a"), dy_step("b", "b")]);
    snap.failure = Some(ScenarioFailure::Continue);
    let mut attempted = Vec::new();
    let run = super::run_scenario_cancellable(
        &snap,
        &[],
        Duration::from_secs(1),
        &AtomicBool::new(false),
        &mut |progress| {
            if let StepProgress::Waiting { index } = progress {
                attempted.push(index);
            }
        },
    );
    assert_eq!(attempted, vec![0, 1]);
    assert!(run
        .steps
        .iter()
        .all(|step| !step.skipped && !step.verdict.passed));
}

#[test]
fn plan_stop_overrides_scenario_continue_in_both_modes() {
    for mode in [PlanMode::Serial, PlanMode::Parallel] {
        let mut scene = lane_snapshot("a", "A", vec![dy_step("a1", "a1"), dy_step("a2", "a2")]);
        scene.failure = Some(ScenarioFailure::Continue);
        let snap = plan_snapshot("plan-stop", mode, PlanFailure::Stop, vec![scene]);
        let run = super::super::execute_plan(&snap, &[], Duration::from_secs(1), &mut |_| {});
        assert!(!run.steps[0].skipped);
        assert!(
            run.steps[1].skipped,
            "Plan stop must stop its failed lane too: {mode:?}"
        );
    }
}

#[test]
fn user_stop_cancels_serial_and_parallel_plan_even_with_continue_policy() {
    for mode in [PlanMode::Serial, PlanMode::Parallel] {
        let cancelled = AtomicBool::new(false);
        let mut step = dy_step("a", "a");
        step.wait = Some(60.0);
        let snap = plan_snapshot(
            "cancel-plan",
            mode,
            PlanFailure::Continue,
            vec![
                lane_snapshot("a", "A", vec![step.clone()]),
                lane_snapshot("b", "B", vec![step]),
            ],
        );
        let run = super::super::execute_plan_cancellable(
            &snap,
            &[],
            Duration::from_secs(1),
            &cancelled,
            &mut |progress| {
                if matches!(progress.progress, StepProgress::Waiting { .. }) {
                    cancelled.store(true, Ordering::SeqCst);
                }
            },
        );
        assert!(run.cancelled);
        assert!(run.steps.iter().all(|step| step.skipped));
    }
}

#[test]
fn interrupted_checkpoint_retains_completed_receipts_and_unfinished_payloads() {
    let dir = std::env::temp_dir().join(format!("mockpulse-checkpoint-{}", uuid::Uuid::new_v4()));
    let snap = plan_snapshot(
        "checkpoint",
        PlanMode::Parallel,
        PlanFailure::Continue,
        vec![lane_snapshot(
            "a",
            "A",
            vec![dy_step("one", "one"), dy_step("two", "two")],
        )],
    );
    let mut checkpoint = super::super::commands::interrupted_plan_record(
        &snap,
        &[],
        super::super::commands::RunShape::Plan,
    );
    crate::runs::store::upsert_run(&dir, checkpoint.clone()).unwrap();
    let initial = crate::runs::store::load_runs(&dir).unwrap();
    assert!(initial[0].cancelled);
    assert!(initial[0].steps.iter().all(|step| step.skipped));
    assert_eq!(initial[0].steps[1].payload, snap.scenarios[0].steps[1].body);
    checkpoint.steps[0] = super::super::tag_lane(
        super::super::failed_without_send(&snap.scenarios[0].steps[0], "no connection".into()),
        0,
        "A",
    );
    crate::runs::store::upsert_run(&dir, checkpoint).unwrap();
    let reloaded = crate::runs::store::load_runs(&dir).unwrap();
    assert_eq!(reloaded.len(), 1);
    assert!(!reloaded[0].steps[0].skipped);
    assert_eq!(
        reloaded[0].steps[0].receipt.error.as_deref(),
        Some("no connection")
    );
    assert!(reloaded[0].steps[1].skipped);
    assert_eq!(reloaded[0].steps[1].lane_index, Some(0));
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn interrupted_scenario_checkpoint_degenerates_to_scenario_shape() {
    // 剧本运行 = 单 lane 编排（RunShape::Scenario）：中断检查点退化回剧本
    // 形态——来源/名称字段还原、步骤不落 lane 归属，载荷快照原样保留
    // （与编排形态逐字节差异仅在 source/名称/lane 字段）。
    let snap = snapshot("checkpoint-solo", vec![dy_step("one", "one")]);
    let checkpoint = super::super::commands::interrupted_plan_record(
        &super::super::commands::solo_plan(snap.clone()),
        &[],
        super::super::commands::RunShape::Scenario,
    );
    assert!(checkpoint.cancelled);
    assert_eq!(checkpoint.source, "scenario");
    assert_eq!(
        checkpoint.scenario_name.as_deref(),
        Some("从进入会话到商品咨询")
    );
    assert_eq!(checkpoint.plan_name, None);
    assert_eq!(checkpoint.mode, Some(PlanMode::Serial));
    assert_eq!(checkpoint.source_id.as_deref(), Some("scn-1"));
    assert_eq!(checkpoint.steps.len(), 1);
    let step = &checkpoint.steps[0];
    assert!(step.skipped);
    assert_eq!(step.lane_index, None);
    assert_eq!(step.lane_name, None);
    assert_eq!(step.payload, snap.steps[0].body);
}

#[test]
fn parallel_checkpoint_patches_land_by_lane_prefix_despite_out_of_order_finish() {
    // 并行乱序完成（lane 1 无等待先完成，lane 0 带等待后完成）：检查点补丁
    // 仍按「记录内步骤下标 = 前 lane 步数前缀和」落位——lane 1 的回执先到
    // 却落平铺下标 2，归属保持槽位原值，与完成先后无关。
    let slow = {
        let mut step = dy_step("a1", "a1");
        step.wait = Some(0.2);
        step
    };
    let mut lane_a = lane_snapshot("a", "A", vec![slow, dy_step("a2", "a2")]);
    lane_a.failure = Some(ScenarioFailure::Continue);
    let snap = plan_snapshot(
        "patch-order",
        PlanMode::Parallel,
        PlanFailure::Continue,
        vec![lane_a, lane_snapshot("b", "B", vec![dy_step("b1", "b1")])],
    );
    let mut checkpoint = super::super::commands::interrupted_plan_record(
        &snap,
        &[],
        super::super::commands::RunShape::Plan,
    );
    let mut finished_lanes = Vec::new();
    super::super::execute_plan_cancellable(
        &snap,
        &[],
        Duration::from_secs(1),
        &AtomicBool::new(false),
        &mut |lane_progress| {
            if let StepProgress::Finished { index, step, .. } = &lane_progress.progress {
                finished_lanes.push(lane_progress.lane);
                super::super::patch_checkpoint_step(
                    &mut checkpoint,
                    lane_progress.lane,
                    *index,
                    step.clone(),
                );
            }
        },
    );
    // 完成顺序确实乱序：lane 1 的回执先于 lane 0 全部回执到达
    assert_eq!(finished_lanes, vec![1, 0, 0]);
    // lane 1 落 lane 0 两步之后（平铺下标 2），内容与归属均为 lane 1
    assert_eq!(checkpoint.steps[2].event_name, "b1");
    assert_eq!(
        checkpoint.steps[2].payload,
        r#"{"event":"im_receive_msg","content":{"text":"b1"}}"#
    );
    assert_eq!(checkpoint.steps[2].lane_index, Some(1));
    assert_eq!(checkpoint.steps[2].lane_name.as_deref(), Some("B"));
    assert!(!checkpoint.steps[2].skipped);
    // lane 0 两步各落前缀位 0/1，归属保持 A；检查点三格全部被回执覆盖
    assert_eq!(checkpoint.steps[0].event_name, "a1");
    assert_eq!(checkpoint.steps[1].event_name, "a2");
    assert!(checkpoint.steps[..2].iter().all(|step| {
        !step.skipped && step.lane_index == Some(0) && step.lane_name.as_deref() == Some("A")
    }));
}

#[test]
fn checkpoint_patch_keeps_scenario_shape_unattributed() {
    // 剧本形态（单 lane 退化）的检查点补丁：偏移恒 0、槽位归属保持 None，
    // 补丁不为单 lane 记录引入 lane 归属。
    let snap = snapshot("patch-solo", vec![dy_step("one", "one"), dy_step("two", "two")]);
    let mut checkpoint = super::super::commands::interrupted_plan_record(
        &super::super::commands::solo_plan(snap.clone()),
        &[],
        super::super::commands::RunShape::Scenario,
    );
    super::super::patch_checkpoint_step(
        &mut checkpoint,
        0,
        1,
        super::super::failed_without_send(&snap.steps[1], "no connection".into()),
    );
    assert_eq!(checkpoint.steps[1].event_name, "two");
    assert!(!checkpoint.steps[1].skipped);
    assert_eq!(
        checkpoint.steps[1].receipt.error.as_deref(),
        Some("no connection")
    );
    assert_eq!(checkpoint.steps[1].lane_index, None);
    assert_eq!(checkpoint.steps[1].lane_name, None);
    // 未补丁的槽位保持中断占位
    assert!(checkpoint.steps[0].skipped);
}

#[test]
fn checkpoint_write_patches_before_persist_and_propagates_persist_error() {
    // 回写组合操作：先补丁再落盘（注入的 persist 收到已补丁记录），
    // 落盘失败原样上抛——「落盘失败进 run-progress 事件 error」
    // 脱离 AppHandle 可直测。
    let snap = snapshot("write-solo", vec![dy_step("one", "one")]);
    let mut checkpoint = super::super::commands::interrupted_plan_record(
        &super::super::commands::solo_plan(snap.clone()),
        &[],
        super::super::commands::RunShape::Scenario,
    );
    let mut persisted: Option<crate::runs::RunRecord> = None;
    let result = super::super::write_checkpoint_step(
        &mut checkpoint,
        0,
        0,
        super::super::failed_without_send(&snap.steps[0], "no connection".into()),
        |record| {
            persisted = Some(record);
            Err("磁盘已满，无法保存运行快照".into())
        },
    );
    assert_eq!(result, Err("磁盘已满，无法保存运行快照".into()));
    // persist 收到的是已补丁记录：回执已替换中断占位
    let persisted = persisted.as_ref().unwrap();
    assert!(!persisted.steps[0].skipped);
    assert_eq!(
        persisted.steps[0].receipt.error.as_deref(),
        Some("no connection")
    );
    // 内存检查点同步补丁，落盘与内存同源
    assert!(!checkpoint.steps[0].skipped);
}
