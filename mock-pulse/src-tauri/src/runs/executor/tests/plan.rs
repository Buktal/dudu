//! 编排执行（#21）全链路：parallel 交错到达与剧内严格有序、serial 整体有序、
//! stop/continue 失败策略在两种 mode 下的落点（步骤拼接、lane 归属、进度事件）。

use std::sync::Arc;
use std::time::Duration;

use crate::plans::{PlanFailure, PlanMode};
use crate::runs::progress::{LaneProgress, StepProgress};
use crate::test_support::{ok_responder, start_concurrent_server, RecordedPost, Responder};

use super::*;

/// 从请求 body 提取步骤文本（快照 body = {"event":...,"content":{"text":"xx"}}）。
fn request_text(post: &RecordedPost) -> String {
    let start = post
        .body
        .find("\"text\":\"")
        .map(|index| index + "\"text\":\"".len())
        .unwrap_or(0);
    post.body[start..]
        .split('"')
        .next()
        .unwrap_or_default()
        .to_string()
}

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

#[test]
fn serial_plan_stop_skips_whole_scenarios_after_failure() {
    // A 第 2 步 500 → 失败即停：B 整体不启动，无请求发出，全 skipped
    let responder: Responder = Arc::new(|_index, _line, body| {
        if body.contains("\"text\":\"boom\"") {
            (
                "HTTP/1.1 500 Internal Server Error".to_string(),
                "boom".to_string(),
            )
        } else {
            ("HTTP/1.1 200 OK".to_string(), "ok".to_string())
        }
    });
    let (addr, rx) = start_concurrent_server(2, responder, Duration::ZERO);
    let snap = plan_snapshot(
        "run-plan-stop",
        PlanMode::Serial,
        PlanFailure::Stop,
        vec![
            lane_snapshot(
                "scn-a",
                "剧本A",
                vec![dy_step("a1", "ok"), dy_step("a2", "boom")],
            ),
            lane_snapshot(
                "scn-b",
                "剧本B",
                vec![dy_step("b1", "b1"), dy_step("b2", "b2")],
            ),
        ],
    );

    let mut progress = Vec::new();
    let run = super::super::execute_plan(
        &snap,
        &[douyin_connection(format!("http://{addr}/hook"))],
        Duration::from_secs(2),
        &mut |p| progress.push(p),
    );

    // 失败剧本之后的剧本不发请求（只有 A 的两步到达）
    let mut seen = 0;
    while let Ok(_post) = rx.recv_timeout(Duration::from_millis(300)) {
        seen += 1;
    }
    assert_eq!(seen, 2, "失败即停：后续剧本不应发请求");

    // 记录：步骤按 lane 拼接，B 的步骤全 skipped + 剧本级原因
    assert_eq!(run.steps.len(), 4);
    assert!(run.steps[0].verdict.passed);
    assert!(!run.steps[1].verdict.passed);
    assert!(!run.steps[1].skipped);
    for step in &run.steps[2..] {
        assert!(step.skipped);
        assert!(
            step.verdict.reason.contains("前序剧本失败"),
            "未启动剧本的结论应指明原因：{}",
            step.verdict.reason
        );
        assert_eq!(step.receipt.status, 0);
        assert_eq!(step.signature, "");
        assert_eq!(step.lane_index, Some(1));
        assert_eq!(step.lane_name.as_deref(), Some("剧本B"));
    }

    // 进度：lane 1 只发 skipped 事件
    let lane1: Vec<&LaneProgress> = progress.iter().filter(|p| p.lane == 1).collect();
    assert_eq!(lane1.len(), 2);
    assert!(lane1
        .iter()
        .all(|p| matches!(p.progress, StepProgress::Skipped { .. })));
}

#[test]
fn serial_plan_continue_finishes_all_scenarios() {
    // A 首步即失败；failure=continue → B 仍完整执行（剧内失败即停语义不变）
    let responder: Responder = Arc::new(|_index, _line, body| {
        if body.contains("\"text\":\"boom\"") {
            (
                "HTTP/1.1 500 Internal Server Error".to_string(),
                "boom".to_string(),
            )
        } else {
            ("HTTP/1.1 200 OK".to_string(), "ok".to_string())
        }
    });
    let (addr, rx) = start_concurrent_server(3, responder, Duration::ZERO);
    let snap = plan_snapshot(
        "run-plan-continue",
        PlanMode::Serial,
        PlanFailure::Continue,
        vec![
            lane_snapshot("scn-a", "剧本A", vec![dy_step("a1", "boom")]),
            lane_snapshot(
                "scn-b",
                "剧本B",
                vec![dy_step("b1", "b1"), dy_step("b2", "b2")],
            ),
        ],
    );

    let mut progress = Vec::new();
    let run = super::super::execute_plan(
        &snap,
        &[douyin_connection(format!("http://{addr}/hook"))],
        Duration::from_secs(2),
        &mut |p| progress.push(p),
    );

    // 全部剧本执行完毕：3 个请求都到达
    let mut seen = 0;
    while let Ok(_post) = rx.recv_timeout(Duration::from_millis(300)) {
        seen += 1;
    }
    assert_eq!(seen, 3, "记录后继续：失败后其余剧本仍全部执行");

    assert_eq!(run.steps.len(), 3);
    assert!(!run.steps[0].verdict.passed);
    assert_eq!(run.steps[0].lane_index, Some(0));
    assert!(run.steps[1].verdict.passed && !run.steps[1].skipped);
    assert!(run.steps[2].verdict.passed && !run.steps[2].skipped);
    assert_eq!(run.steps[1].lane_index, Some(1));
    assert_eq!(run.steps[2].lane_index, Some(1));
}

#[test]
fn parallel_plan_stop_halts_other_scenarios_after_failure() {
    // A 首步快返回 500；B 长链路（每步慢响应）→ B 除在途步外后续 skipped
    let responder: Responder = Arc::new(|_index, _line, body| {
        if body.contains("\"text\":\"boom\"") {
            (
                "HTTP/1.1 500 Internal Server Error".to_string(),
                "boom".to_string(),
            )
        } else {
            // 慢响应：为 B 制造在途窗口（A 在此期间失败置位取消旗标）
            std::thread::sleep(Duration::from_millis(150));
            ("HTTP/1.1 200 OK".to_string(), "ok".to_string())
        }
    });
    let (addr, rx) = start_concurrent_server(2, responder, Duration::ZERO);
    let snap = plan_snapshot(
        "run-plan-parallel-stop",
        PlanMode::Parallel,
        PlanFailure::Stop,
        vec![
            lane_snapshot("scn-a", "剧本A", vec![dy_step("a1", "boom")]),
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
    );

    let mut progress = Vec::new();
    let run = super::super::execute_plan(
        &snap,
        &[douyin_connection(format!("http://{addr}/hook"))],
        Duration::from_secs(3),
        &mut |p| progress.push(p),
    );

    // 只有 A 的失败步与 B 的在途步发出请求
    let mut seen = Vec::new();
    while let Ok(post) = rx.recv_timeout(Duration::from_millis(300)) {
        seen.push(request_text(&post));
    }
    seen.sort();
    assert_eq!(
        seen,
        vec!["b1", "boom"],
        "取消旗标后不应再启动 B 的后续步骤"
    );

    // B 的在途步自然完成（通过），后续步骤 skipped
    assert_eq!(run.steps.len(), 4);
    assert!(!run.steps[0].verdict.passed, "A 失败步");
    assert_eq!(run.steps[0].lane_index, Some(0));
    assert!(run.steps[1].verdict.passed, "B 的在途步应自然完成");
    assert!(!run.steps[1].skipped);
    assert_eq!(run.steps[1].lane_index, Some(1));
    for step in &run.steps[2..] {
        assert!(step.skipped);
        assert!(
            step.verdict.reason.contains("编排停止"),
            "并行取消的结论应指明编排停止：{}",
            step.verdict.reason
        );
        assert_eq!(step.lane_index, Some(1));
        assert_eq!(step.lane_name.as_deref(), Some("剧本B"));
    }
}

#[test]
fn parallel_plan_continue_ignores_other_lane_failures() {
    // failure=continue：A 快失败不拦 B——B 长链路应跑完所有步骤
    let responder: Responder = Arc::new(|_index, _line, body| {
        if body.contains("\"text\":\"boom\"") {
            (
                "HTTP/1.1 500 Internal Server Error".to_string(),
                "boom".to_string(),
            )
        } else {
            std::thread::sleep(Duration::from_millis(30));
            ("HTTP/1.1 200 OK".to_string(), "ok".to_string())
        }
    });
    let (addr, rx) = start_concurrent_server(4, responder, Duration::ZERO);
    let snap = plan_snapshot(
        "run-plan-parallel-continue",
        PlanMode::Parallel,
        PlanFailure::Continue,
        vec![
            lane_snapshot("scn-a", "剧本A", vec![dy_step("a1", "boom")]),
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
    );

    let mut progress = Vec::new();
    let run = super::super::execute_plan(
        &snap,
        &[douyin_connection(format!("http://{addr}/hook"))],
        Duration::from_secs(3),
        &mut |p| progress.push(p),
    );

    // A 1 个请求（文本 boom）+ B 全部 3 个请求
    let mut seen = Vec::new();
    while let Ok(post) = rx.recv_timeout(Duration::from_millis(300)) {
        seen.push(request_text(&post));
    }
    seen.sort();
    assert_eq!(seen, vec!["b1", "b2", "b3", "boom"]);

    assert_eq!(run.steps.len(), 4);
    assert!(!run.steps[0].verdict.passed);
    assert!(run.steps[1..].iter().all(|step| step.verdict.passed));
    assert!(run.steps[1..].iter().all(|step| !step.skipped));
}
