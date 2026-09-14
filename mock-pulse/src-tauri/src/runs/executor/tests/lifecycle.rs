//! 生命周期语义：用户取消打断等待、剧本 continue 记录后继续、编排 stop 覆盖
//! 剧本 continue、用户停止贯穿串/并行编排、中断检查点落盘往返。

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use crate::plans::{PlanFailure, PlanMode};
use crate::runs::progress::StepProgress;

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
    snap.failure = Some("continue".into());
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
        scene.failure = Some("continue".into());
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
