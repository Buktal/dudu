//! 编排执行（#21）的串并行编织语义：parallel 交错到达与剧内严格有序、
//! serial 整体有序（步骤拼接、lane 归属、进度事件）。失败策略（stop/
//! continue）与 lane 线程异常的落点见 plan_policy。

use std::time::Duration;

use crate::plans::{PlanFailure, PlanMode};
use crate::runs::progress::StepProgress;
use crate::test_support::{ok_responder, start_concurrent_server, RecordedPost};

use super::*;

/// two_lanes：A（3 步 a1–a3）+ B（3 步 b1–b3），同走一个抖音连接。
fn two_lane_plan() -> PlanRunSnapshot {
    plan_snapshot(
        "run-plan",
        PlanMode::Parallel,
        PlanFailure::Continue,
        vec![
            lane_snapshot(
                "scn-a",
                "剧本A",
                vec![
                    dy_step("a1", "a1"),
                    dy_step("a2", "a2"),
                    dy_step("a3", "a3"),
                ],
            ),
            lane_snapshot(
                "scn-b",
                "剧本B",
                vec![
                    dy_step("b1", "b1"),
                    dy_step("b2", "b2"),
                    dy_step("b3", "b3"),
                ],
            ),
        ],
    )
}

#[test]
fn parallel_plan_interleaves_scenarios_and_keeps_each_ordered() {
    let (addr, rx) = start_concurrent_server(6, ok_responder(), Duration::from_millis(120));
    let snap = two_lane_plan();

    let mut progress = Vec::new();
    let run = super::super::execute_plan(
        &snap,
        &[douyin_connection(format!("http://{addr}/hook"))],
        Duration::from_secs(3),
        &mut |p| progress.push(p),
    );

    let mut requests = Vec::new();
    for _ in 0..6 {
        requests.push(rx.recv_timeout(Duration::from_secs(3)).unwrap());
    }

    // 各剧本内部 body 到达顺序 = 步骤顺序，且剧内串行（等上一步响应再发下一步）
    for (tag, expected) in [("a", vec!["a1", "a2", "a3"]), ("b", vec!["b1", "b2", "b3"])] {
        let mut lane_requests: Vec<&RecordedPost> = requests
            .iter()
            .filter(|post| request_text(post).starts_with(tag))
            .collect();
        lane_requests.sort_by_key(|post| post.arrived_at);
        let texts: Vec<String> = lane_requests
            .iter()
            .map(|post| request_text(post))
            .collect();
        assert_eq!(texts, expected, "剧本 {tag} 内应按步骤顺序到达");
        for pair in lane_requests.windows(2) {
            assert!(
                pair[1].arrived_at >= pair[0].responded_at,
                "剧本 {tag} 第 2 步应等第 1 步响应后再发（剧内严格有序）"
            );
        }
    }

    // 并行交错：B 的第 1 步到达早于 A 的第 1 步响应写出
    let a_first = requests
        .iter()
        .filter(|post| request_text(post) == "a1")
        .next()
        .unwrap();
    let b_first = requests
        .iter()
        .filter(|post| request_text(post) == "b1")
        .next()
        .unwrap();
    assert!(
        b_first.arrived_at < a_first.responded_at,
        "并行模式下两剧本应 T+0 同时起跑（交错到达）"
    );

    // 运行记录：source plan + planName 快照 + 步骤按 lane 顺序拼接、携带归属
    assert_eq!(run.id, "run-plan");
    assert_eq!(run.source, "plan");
    assert_eq!(run.scenario_name, None);
    assert_eq!(run.plan_name.as_deref(), Some("双平台接待回归"));
    assert_eq!(run.steps.len(), 6);
    for (index, step) in run.steps.iter().enumerate() {
        let expected_lane = if index < 3 { 0 } else { 1 };
        assert_eq!(step.lane_index, Some(expected_lane));
        assert_eq!(
            step.lane_name.as_deref(),
            Some(if expected_lane == 0 {
                "剧本A"
            } else {
                "剧本B"
            })
        );
        assert!(step.verdict.passed, "步骤 {index} 应通过");
        assert_eq!(
            step.event_name,
            snap.scenarios[expected_lane].steps[index % 3].event_name
        );
    }

    // 进度事件：全部带 lane 归属，无 skipped
    assert_eq!(progress.len(), 12);
    assert!(progress
        .iter()
        .all(|p| matches!(p.progress, StepProgress::Skipped { .. }) == false));
    assert!(progress.iter().all(|p| p.lane <= 1));
}

#[test]
fn serial_plan_runs_scenarios_strictly_in_order() {
    let (addr, rx) = start_concurrent_server(6, ok_responder(), Duration::from_millis(40));
    let mut snap = two_lane_plan();
    snap.mode = PlanMode::Serial;

    let mut progress = Vec::new();
    let run = super::super::execute_plan(
        &snap,
        &[douyin_connection(format!("http://{addr}/hook"))],
        Duration::from_secs(3),
        &mut |p| progress.push(p),
    );

    let mut requests = Vec::new();
    for _ in 0..6 {
        requests.push(rx.recv_timeout(Duration::from_secs(3)).unwrap());
    }
    let mut by_arrival = requests.clone();
    by_arrival.sort_by_key(|post| post.arrived_at);
    let order: Vec<String> = by_arrival.iter().map(|post| request_text(post)).collect();
    assert_eq!(
        order,
        vec!["a1", "a2", "a3", "b1", "b2", "b3"],
        "串行编排整体到达顺序 = 编排顺序"
    );
    // 严格顺序：前剧末步响应写出后，后剧第 1 步才到达
    let a_last = requests
        .iter()
        .find(|post| request_text(post) == "a3")
        .unwrap();
    let b_first = requests
        .iter()
        .find(|post| request_text(post) == "b1")
        .unwrap();
    assert!(
        b_first.arrived_at >= a_last.responded_at,
        "串行模式：前一剧本完全结束后才启动下一个"
    );

    assert_eq!(run.source, "plan");
    assert_eq!(run.steps.len(), 6);
    assert!(run.steps.iter().all(|step| step.verdict.passed));
    // 进度：lane 0 的全部事件先于 lane 1 的事件（串行无交错）
    let last_lane0 = progress.iter().rposition(|p| p.lane == 0).unwrap();
    assert!(progress[..last_lane0].iter().all(|p| p.lane == 0));
    assert!(progress[last_lane0 + 1..].iter().all(|p| p.lane == 1));
}
