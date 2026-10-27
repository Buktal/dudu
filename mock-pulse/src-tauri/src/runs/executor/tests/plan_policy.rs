//! 编排失败策略（stop/continue）与 lane 线程异常的落点：失败后哪些步骤
//! skipped、取消旗标何时不再启动新步骤、lane panic 折叠剩余步骤且记录照常
//! 完成。串并行编织语义（交错/有序、lane 归属拼接）见 plan。

use std::sync::Arc;
use std::time::Duration;

use crate::plans::{PlanFailure, PlanMode};
use crate::runs::progress::{LaneProgress, StepProgress};
use crate::test_support::{ok_responder, start_concurrent_server, Responder};

use super::*;

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

#[test]
fn parallel_lane_panic_folds_remaining_steps_and_record_still_completes() {
    // B lane 在回报第 1 步完成时 panic（模拟 lane 线程异常，如 narrow!
    // unreachable）：join Err 折叠为该剧本剩余步骤的失败回执，宿主线程
    // 不二次引爆，记录槽位齐全照常产出（finish 链路的事件/落盘消费的就是它）
    let (addr, rx) = start_concurrent_server(3, ok_responder(), Duration::ZERO);
    let snap = plan_snapshot(
        "run-plan-panic",
        PlanMode::Parallel,
        PlanFailure::Continue,
        vec![
            lane_snapshot(
                "scn-a",
                "剧本A",
                vec![dy_step("a1", "a1"), dy_step("a2", "a2")],
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
    );

    let mut progress = Vec::new();
    let run = super::super::execute_plan(
        &snap,
        &[douyin_connection(format!("http://{addr}/hook"))],
        Duration::from_secs(3),
        &mut |p: LaneProgress| {
            let panic_here =
                p.lane == 1 && matches!(p.progress, StepProgress::Finished { index: 0, .. });
            if panic_here {
                panic!("注入的 lane 线程 panic");
            }
            progress.push(p);
        },
    );

    // 只有 A 的两步与 B 的第 1 步发出请求（B 在第 2 步启动前已随线程终止）
    let mut seen = Vec::new();
    while let Ok(post) = rx.recv_timeout(Duration::from_millis(300)) {
        seen.push(request_text(&post));
    }
    seen.sort();
    assert_eq!(seen, vec!["a1", "a2", "b1"]);

    // 记录槽位齐全（2 + 3）：B 已完成的首步经台账原样保留，剩余两步折叠
    // 为「线程 panic」失败回执，lane 归属不变
    assert_eq!(run.steps.len(), 5);
    assert!(run.steps[0].verdict.passed && run.steps[1].verdict.passed);
    assert_eq!(run.steps[2].event_name, "b1");
    assert!(run.steps[2].verdict.passed, "B 已完成的首步应原样保留");
    assert!(!run.steps[2].skipped);
    assert_eq!(run.steps[2].lane_index, Some(1));
    for step in &run.steps[3..] {
        assert!(step.skipped);
        assert!(
            step.verdict.reason.contains("panic"),
            "折叠回执应注明线程 panic：{}",
            step.verdict.reason
        );
        assert_eq!(step.receipt.status, 0);
        assert_eq!(step.lane_index, Some(1));
        assert_eq!(step.lane_name.as_deref(), Some("剧本B"));
    }

    // 进度：lane 1 只落到第 1 步的 waiting（finished 上报随线程 panic 丢失）
    let lane1: Vec<&LaneProgress> = progress.iter().filter(|p| p.lane == 1).collect();
    assert_eq!(lane1.len(), 1);
    assert!(matches!(
        lane1[0].progress,
        StepProgress::Waiting { index: 0 }
    ));
}
