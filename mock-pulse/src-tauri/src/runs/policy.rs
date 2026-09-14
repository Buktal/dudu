//! 失败策略显式化（批 3a）：把「这一步/这一剧跳不跳、为何跳」从 executor
//! 编织函数（serial/parallel 各自接线）的旗标组合推理中提炼为单点决策表。
//!
//! 决策输入 = 构造位置（单剧本 / 串行 lane / 并行 lane，即编织 mode）
//! × 编排失败策略（stop/continue）× 剧本级失败策略（快照 failure）
//! × 外部停止信号（用户停 / 编排停 / 无）；输出 = 执行，或跳过 + 原因。
//! 5 种跳过原因的对外文案由 [`SkipReason`] 唯一持有（落盘/进度一字不改）。
//!
//! 两种停止旗标的排序语义（原样保留）：
//! - 用户停止（`user_cancel`）：`SeqCst` 采样——与 `control::stop_run` 的置位、
//!   运行记录 `cancelled` 的判定跨线程握手，需要全序可见；
//! - 编排停止（`orchestration_cancel`，仅并行 stop 存在）：`Relaxed` 采样——
//!   失败即停只要求「在途步骤自然完成后不再启动后续步骤」的最终可见性。

use std::sync::atomic::{AtomicBool, Ordering};

use crate::plans::PlanFailure;

use super::executor::ScenarioRunSnapshot;

/// 跳过原因：策略决策的产出，落盘结论（verdict.reason）文案的唯一来源。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum SkipReason {
    /// 本剧本前序步骤失败（剧内失败即停）
    PreviousStepFailed,
    /// 串行编排：前序剧本失败，本剧本未启动
    PreviousScenarioFailed,
    /// 并行编排：其他剧本失败触发编排停止，本步骤不再启动
    OrchestrationStopped,
    /// 用户停止运行
    UserStopped,
    /// 发送前等待期间运行被停止（用户停止或编排停止）
    RunStopped,
}

impl SkipReason {
    /// 对外文案（落盘 verdict.reason）。ADR-0001 精神：一字不改。
    pub(super) fn text(self) -> &'static str {
        match self {
            SkipReason::PreviousStepFailed => "前序步骤失败，本步骤未执行",
            SkipReason::PreviousScenarioFailed => "前序剧本失败，本剧本未执行",
            SkipReason::OrchestrationStopped => "其他剧本已失败，编排停止，本剧本未执行",
            SkipReason::UserStopped => "用户已停止运行，本步骤未执行",
            SkipReason::RunStopped => "运行已停止，本步骤未执行",
        }
    }
}

/// 单步决策：执行，或跳过（附原因）。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(super) enum StepDecision {
    Execute,
    Skip(SkipReason),
}

/// 单 lane（剧本）失败策略决策表。有状态：`own_failed`/`halt` 随步骤推进锁存。
///
/// 决策表——[`LanePolicy::decide`] 每步启动前按序求值，先命中先跳过：
///
/// | # | 输入（停止信号 / 已锁存状态） | 输出 |
/// |---|-------------------------------|------|
/// | 1 | 用户停止（SeqCst） | 跳过 · [`SkipReason::UserStopped`] |
/// | 2 | 本剧已有失败步骤，且「本剧失败应截停」 | 跳过 · [`SkipReason::PreviousStepFailed`] |
/// | 3 | 剧本级停跳锁存（串行：前剧失败未启动） | 跳过 · 锁存原因 |
/// | 4 | 编排停止旗标已置位（Relaxed；仅并行 stop 持旗标） | 跳过 · [`SkipReason::OrchestrationStopped`]（并锁存） |
/// | 5 | 其余 | 执行 |
///
/// 「本剧失败应截停」（#2 条件）= 编排失败策略为 stop（编排 stop 覆盖剧本
/// continue），或剧本级 failure ≠ continue（缺省 stop）。
///
/// 三种构造位置（编织 mode 的编码）：
/// - [`LanePolicy::scenario`]：单剧本运行。无编排语义、不持编排旗标。
/// - [`LanePolicy::serial`]：串行编排 lane。**不持编排旗标**——本剧失败不泄漏
///   为取消信号，跨剧传播由 `execute_lane_steps` 返回的 own_failed 经
///   previous_failed → 下一剧的 halt 种子（[`SkipReason::PreviousScenarioFailed`]）承载。
/// - [`LanePolicy::parallel`]：并行编排 lane。编排 stop 时持跨 lane 共享旗标，
///   本剧失败经 [`LanePolicy::note_failure`] 置位（Relaxed 广播）；continue 时
///   不持——失败只影响本剧内，各剧各跑到底。
pub(super) struct LanePolicy<'a> {
    /// 用户停止旗标：SeqCst 采样（排序语义见模块文档）
    user_cancel: &'a AtomicBool,
    /// 编排停止旗标：Relaxed 采样；单剧本 / 串行 / 并行 continue 为 None
    orchestration_cancel: Option<&'a AtomicBool>,
    /// 本剧失败后是否截停本剧后续步骤（决策表 #2 条件，构造时定死：
    /// 编排 stop 覆盖剧本 continue，或剧本级 failure ≠ continue 缺省 stop）
    stop_after_own_failure: bool,
    /// 本剧失败是否向编排广播停止（仅并行 stop 为 true）
    propagates: bool,
    /// 锁存：一旦置位，本剧后续步骤全部跳过（整体未启动 / 编排停止）
    halt: Option<SkipReason>,
    /// 本剧是否已有失败步骤
    own_failed: bool,
}

impl<'a> LanePolicy<'a> {
    /// 单剧本运行：剧内失败策略只由快照 failure 决定（None 缺省 stop）。
    pub(super) fn scenario(scenario: &ScenarioRunSnapshot, user_cancel: &'a AtomicBool) -> Self {
        Self::new(scenario, user_cancel, None, false, false, None)
    }

    /// 串行编排 lane：前剧失败且编排 stop 时以 halt 种子整体不启动；
    /// 失败传播走 own_failed 返回值，不设旗标（本剧失败不泄漏为取消信号）。
    pub(super) fn serial(
        plan_failure: PlanFailure,
        scenario: &ScenarioRunSnapshot,
        user_cancel: &'a AtomicBool,
        previous_failed: bool,
    ) -> Self {
        let plan_stops = plan_failure == PlanFailure::Stop;
        let halt = (previous_failed && plan_stops).then_some(SkipReason::PreviousScenarioFailed);
        Self::new(scenario, user_cancel, None, plan_stops, false, halt)
    }

    /// 并行编排 lane：编排 stop 共享取消旗标（Relaxed 广播），continue 不持旗标。
    pub(super) fn parallel(
        plan_failure: PlanFailure,
        scenario: &ScenarioRunSnapshot,
        user_cancel: &'a AtomicBool,
        shared_cancel: Option<&'a AtomicBool>,
    ) -> Self {
        let plan_stops = plan_failure == PlanFailure::Stop;
        Self::new(
            scenario,
            user_cancel,
            shared_cancel,
            plan_stops,
            plan_stops,
            None,
        )
    }

    fn new(
        scenario: &ScenarioRunSnapshot,
        user_cancel: &'a AtomicBool,
        orchestration_cancel: Option<&'a AtomicBool>,
        plan_stops: bool,
        propagates: bool,
        halt: Option<SkipReason>,
    ) -> Self {
        let scenario_stops = scenario.failure.as_deref().unwrap_or("stop") != "continue";
        Self {
            user_cancel,
            orchestration_cancel,
            propagates,
            halt,
            own_failed: false,
            // 编排 stop 覆盖剧本 continue；剧本缺省（None）即 stop
            stop_after_own_failure: plan_stops || scenario_stops,
        }
    }

    /// 每步启动前决策（按决策表 #1→#5 求值，先命中先跳过）。
    pub(super) fn decide(&mut self) -> StepDecision {
        if self.user_cancel.load(Ordering::SeqCst) {
            return StepDecision::Skip(SkipReason::UserStopped);
        }
        if self.own_failed && self.stop_after_own_failure {
            return StepDecision::Skip(SkipReason::PreviousStepFailed);
        }
        if let Some(reason) = self.halt {
            return StepDecision::Skip(reason);
        }
        if self.orchestration_stopped() {
            // 锁存：编排停止后本剧不再启动任何后续步骤
            self.halt = Some(SkipReason::OrchestrationStopped);
            return StepDecision::Skip(SkipReason::OrchestrationStopped);
        }
        StepDecision::Execute
    }

    /// 发送前等待是否被停止打断（用户停止 SeqCst / 编排停止 Relaxed 任一）。
    /// 不锁存——后续步骤仍由 [`LanePolicy::decide`] 重新裁决归因。
    pub(super) fn stopped_during_wait(&self) -> bool {
        self.user_cancel.load(Ordering::SeqCst) || self.orchestration_stopped()
    }

    /// 步骤失败后的策略反应：锁存 own_failed；并行 stop 时置位共享取消旗标
    /// （Relaxed 广播，其余 lane 借决策表 #4 进入「编排停止」）。
    pub(super) fn note_failure(&mut self) {
        self.own_failed = true;
        if self.propagates {
            if let Some(cancel) = self.orchestration_cancel {
                cancel.store(true, Ordering::Relaxed);
            }
        }
    }

    /// 本剧是否出现过失败步骤（串行编排据此让后续剧本整体不启动）。
    pub(super) fn own_failed(&self) -> bool {
        self.own_failed
    }

    /// 编排停止旗标是否已置位（Relaxed；None = 本 lane 不受编排取消影响）。
    fn orchestration_stopped(&self) -> bool {
        self.orchestration_cancel
            .is_some_and(|cancel| cancel.load(Ordering::Relaxed))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scenario(failure: Option<&str>) -> ScenarioRunSnapshot {
        ScenarioRunSnapshot {
            failure: failure.map(str::to_string),
            run_id: "run-policy".into(),
            scenario_id: "scn-1".into(),
            scenario_name: "剧本".into(),
            started_at: "2026-09-12T04:00:00.000Z".into(),
            steps: Vec::new(),
        }
    }

    #[test]
    fn skip_reason_texts_match_persisted_wording_verbatim() {
        assert_eq!(
            SkipReason::PreviousStepFailed.text(),
            "前序步骤失败，本步骤未执行"
        );
        assert_eq!(
            SkipReason::PreviousScenarioFailed.text(),
            "前序剧本失败，本剧本未执行"
        );
        assert_eq!(
            SkipReason::OrchestrationStopped.text(),
            "其他剧本已失败，编排停止，本剧本未执行"
        );
        assert_eq!(
            SkipReason::UserStopped.text(),
            "用户已停止运行，本步骤未执行"
        );
        assert_eq!(SkipReason::RunStopped.text(), "运行已停止，本步骤未执行");
    }

    #[test]
    fn user_stop_outranks_every_other_branch() {
        let user = AtomicBool::new(true);
        let snap = scenario(Some("continue"));
        // 前剧失败种子（#3）+ 本剧已失败（#2）同时成立：用户停止（#1）仍最先命中
        let mut policy = LanePolicy::serial(PlanFailure::Stop, &snap, &user, true);
        policy.note_failure();
        assert_eq!(policy.decide(), StepDecision::Skip(SkipReason::UserStopped));
    }

    #[test]
    fn own_failure_ranks_above_latched_halt() {
        let user = AtomicBool::new(false);
        let snap = scenario(Some("continue"));
        // halt 已被前剧失败种子占据（#3），但本剧失败（#2）优先归因
        let mut policy = LanePolicy::serial(PlanFailure::Stop, &snap, &user, true);
        policy.note_failure();
        assert_eq!(
            policy.decide(),
            StepDecision::Skip(SkipReason::PreviousStepFailed)
        );
    }

    #[test]
    fn serial_previous_failure_halts_only_under_stop_policy() {
        let user = AtomicBool::new(false);
        let snap = scenario(None);

        let mut cont = LanePolicy::serial(PlanFailure::Continue, &snap, &user, true);
        assert_eq!(cont.decide(), StepDecision::Execute);

        let mut stop = LanePolicy::serial(PlanFailure::Stop, &snap, &user, true);
        assert_eq!(
            stop.decide(),
            StepDecision::Skip(SkipReason::PreviousScenarioFailed)
        );
        // 锁存：本剧剩余每步同一原因
        assert_eq!(
            stop.decide(),
            StepDecision::Skip(SkipReason::PreviousScenarioFailed)
        );
    }

    #[test]
    fn scenario_failure_policy_decides_own_failure_handling() {
        let user = AtomicBool::new(false);
        // 剧本级缺省（None）= stop：本剧失败后后续步骤跳过
        let default_stop = scenario(None);
        let mut stop = LanePolicy::scenario(&default_stop, &user);
        stop.note_failure();
        assert_eq!(
            stop.decide(),
            StepDecision::Skip(SkipReason::PreviousStepFailed)
        );

        // 剧本级 continue：失败记录后继续执行后续步骤
        let cont = scenario(Some("continue"));
        let mut cont_policy = LanePolicy::scenario(&cont, &user);
        cont_policy.note_failure();
        assert_eq!(cont_policy.decide(), StepDecision::Execute);
    }

    #[test]
    fn plan_stop_overrides_scenario_continue_in_policy() {
        let user = AtomicBool::new(false);
        let snap = scenario(Some("continue"));

        // 编排 stop：剧本 continue 被覆盖，本剧失败仍截停
        let mut serial = LanePolicy::serial(PlanFailure::Stop, &snap, &user, false);
        serial.note_failure();
        assert_eq!(
            serial.decide(),
            StepDecision::Skip(SkipReason::PreviousStepFailed)
        );

        // 编排 continue：剧本 continue 生效，失败后本剧继续
        let shared = AtomicBool::new(false);
        let mut parallel = LanePolicy::parallel(PlanFailure::Continue, &snap, &user, Some(&shared));
        parallel.note_failure();
        assert_eq!(parallel.decide(), StepDecision::Execute);
    }

    #[test]
    fn parallel_stop_propagates_and_other_lane_latches_orchestration_stop() {
        let user = AtomicBool::new(false);
        let shared = AtomicBool::new(false);
        let snap = scenario(None);

        let mut failing = LanePolicy::parallel(PlanFailure::Stop, &snap, &user, Some(&shared));
        failing.note_failure();
        assert!(
            shared.load(Ordering::Relaxed),
            "并行 stop：失败应置位共享旗标"
        );

        let mut other = LanePolicy::parallel(PlanFailure::Stop, &snap, &user, Some(&shared));
        assert_eq!(
            other.decide(),
            StepDecision::Skip(SkipReason::OrchestrationStopped)
        );
        assert_eq!(
            other.decide(),
            StepDecision::Skip(SkipReason::OrchestrationStopped),
            "编排停止应锁存到本剧剩余全部步骤"
        );
    }

    #[test]
    fn parallel_continue_does_not_share_failure_across_lanes() {
        let user = AtomicBool::new(false);
        let snap = scenario(None);

        let mut failing = LanePolicy::parallel(PlanFailure::Continue, &snap, &user, None);
        failing.note_failure();
        // 本剧内仍按剧内失败即停跳过
        assert_eq!(
            failing.decide(),
            StepDecision::Skip(SkipReason::PreviousStepFailed)
        );

        // 不持编排旗标：失败不跨剧泄漏，其余剧本各跑到底
        let mut other = LanePolicy::parallel(PlanFailure::Continue, &snap, &user, None);
        assert_eq!(other.decide(), StepDecision::Execute);
    }

    #[test]
    fn serial_own_failure_does_not_leak_into_sibling_lane() {
        let user = AtomicBool::new(false);
        let snap = scenario(None);

        let mut first = LanePolicy::serial(PlanFailure::Stop, &snap, &user, false);
        first.note_failure();
        // 串行不持编排旗标：本剧后续步骤归因「前序步骤失败」而非「编排停止」
        assert_eq!(
            first.decide(),
            StepDecision::Skip(SkipReason::PreviousStepFailed)
        );

        // 旗标每剧独立：后一剧不受前剧失败影响（跨剧传播只走 halt 种子）
        let mut next = LanePolicy::serial(PlanFailure::Stop, &snap, &user, false);
        assert_eq!(next.decide(), StepDecision::Execute);
    }

    #[test]
    fn stopped_during_wait_reflects_both_signals_without_latching() {
        let user = AtomicBool::new(false);
        let shared = AtomicBool::new(false);
        let snap = scenario(None);
        let mut policy = LanePolicy::parallel(PlanFailure::Stop, &snap, &user, Some(&shared));

        assert!(!policy.stopped_during_wait());

        // 编排停止（Relaxed 采样）即可打断等待
        shared.store(true, Ordering::Relaxed);
        assert!(policy.stopped_during_wait());
        // 等待打断不锁存：旗标回落，归因仍交由决策表重新裁决
        shared.store(false, Ordering::Relaxed);
        assert_eq!(policy.decide(), StepDecision::Execute);

        // 用户停止（SeqCst 采样）同样打断等待，且不持编排旗标的 lane 也生效
        user.store(true, Ordering::SeqCst);
        assert!(policy.stopped_during_wait());
        let solo = LanePolicy::scenario(&snap, &user);
        assert!(solo.stopped_during_wait());
    }
}
