//! 执行器测试：按主题分文件——scenario（单剧本串行）、plan（编排串并行）、
//! lifecycle（取消/继续/中断落盘）。本文件只放各主题共用的构造（连接配置、
//! 步骤/快照 builder、剧本运行测试入口）；TcpListener 网络基建在
//! crate::test_support（全仓共享）。

mod lifecycle;
mod plan;
mod scenario;

use std::sync::atomic::AtomicBool;
use std::time::Duration;

use crate::connections::ConnectionConfig;
use crate::plans::{PlanFailure, PlanMode};
use crate::runs::progress::StepProgress;
use crate::runs::snapshot::{PlanRunSnapshot, ScenarioRunSnapshot, ScenarioStepSnapshot};
use crate::runs::verdict::{ExpectedReceipt, ReceiptBodyMode};
use crate::runs::RunRecord;

// ---- 快照/配置构造 ----

const DY_SECRET: &str = "tt_secret";

pub(super) fn douyin_connection(url: String) -> ConnectionConfig {
    ConnectionConfig::Douyin {
        url,
        system: crate::connections::DouyinSystem::Dop,
        client_key: "tt_key".into(),
        client_secret: DY_SECRET.into(),
        mini_game_token: String::new(),
        isv_token: String::new(),
        isv_key: String::new(),
    }
}

// 企微官方黄金例唯一出处为 wecom::crypto：按测试旧名引作连接配置与加解密断言
use crate::connections::wecom::crypto::{
    GOLDEN_CORP_ID as WC_CORP_ID, GOLDEN_ENCODING_AES_KEY as WC_AES_KEY,
    GOLDEN_TOKEN as WC_TOKEN,
};

/// 剧本运行测试入口：与 `start_scenario_run` 命令边界同构——包单 lane 编排
/// 走编排内核（进度按 StepProgress 透传，单 lane 无 lane 归属），记录退化回
/// 剧本形态。内核坍缩正确性的主证据（scenario/lifecycle 测试共用）。
pub(super) fn run_scenario_cancellable<F>(
    snapshot: &ScenarioRunSnapshot,
    connections: &[ConnectionConfig],
    timeout: Duration,
    user_cancel: &AtomicBool,
    on_progress: &mut F,
) -> RunRecord
where
    F: FnMut(StepProgress) + Send,
{
    let plan = super::commands::solo_plan(snapshot.clone());
    let record = super::execute_plan_cancellable(
        &plan,
        connections,
        timeout,
        user_cancel,
        &mut |lane_progress| on_progress(lane_progress.progress),
    );
    super::commands::scenario_shape(record)
}

pub(super) fn wecom_connection(url: String) -> ConnectionConfig {
    ConnectionConfig::Wecom {
        url,
        corp_id: WC_CORP_ID.into(),
        token: WC_TOKEN.into(),
        encoding_aes_key: WC_AES_KEY.into(),
        agent_id: "218".into(),
    }
}

pub(super) fn dy_step(name: &str, text: &str) -> ScenarioStepSnapshot {
    ScenarioStepSnapshot {
        wait: None,
        event_name: name.into(),
        event_id: format!("evt-{name}"),
        channel: "douyin".into(),
        expected: ExpectedReceipt {
            status: 200,
            body: String::new(),
            body_mode: ReceiptBodyMode::Contains,
        },
        body: format!(r#"{{"event":"im_receive_msg","content":{{"text":"{text}"}}}}"#),
    }
}

pub(super) fn snapshot(id: &str, steps: Vec<ScenarioStepSnapshot>) -> ScenarioRunSnapshot {
    ScenarioRunSnapshot {
        failure: None,
        run_id: id.into(),
        scenario_id: "scn-1".into(),
        scenario_name: "从进入会话到商品咨询".into(),
        started_at: "2026-09-12T02:00:00.000Z".into(),
        steps,
    }
}

pub(super) fn lane_snapshot(
    id: &str,
    name: &str,
    steps: Vec<ScenarioStepSnapshot>,
) -> ScenarioRunSnapshot {
    ScenarioRunSnapshot {
        failure: None,
        run_id: format!("{id}-lane"),
        scenario_id: id.into(),
        scenario_name: name.into(),
        started_at: "2026-09-12T04:00:00.000Z".into(),
        steps,
    }
}

pub(super) fn plan_snapshot(
    run_id: &str,
    mode: PlanMode,
    failure: PlanFailure,
    scenarios: Vec<ScenarioRunSnapshot>,
) -> PlanRunSnapshot {
    PlanRunSnapshot {
        run_id: run_id.into(),
        plan_id: "plan-1".into(),
        plan_name: "双平台接待回归".into(),
        mode,
        failure,
        started_at: "2026-09-12T04:00:00.000Z".into(),
        scenarios,
    }
}
