import { type EventItem, interpretPresence } from "@/features/events";
import { materializeRunSnapshot, type RunSnapshot } from "@/features/runs";
import type { Scenario } from "@/features/scenarios";

import {
  newPlanRunId,
  type Plan,
  type PlanFailure,
  type PlanMode,
  resolveLaneScenario,
} from "./model";

/**
 * 编排快照物化（与剧本运行同一引用哲学，#20/#21）：启动编排时，前端把
 * 每个 lane 引用的剧本解析成「已物化的运行快照」，组装成编排快照交给
 * Rust 执行器。Rust 不感知素材库/剧本/编排概念；启动后编辑剧本/事件/
 * 编排都不影响已启动的运行（快照隔离）。
 * 任何 lane 物化失败抛可读中文错误，不产半成品快照。
 */

/** 物化后的编排运行快照（与 Rust PlanRunSnapshot 对齐，camelCase IPC） */
export type PlanRunSnapshot = {
  runId: string;
  planId: string;
  planName: string;
  mode: PlanMode;
  failure: PlanFailure;
  startedAt: string;
  /** lanes（有序）：每个剧本一份已物化的运行快照 */
  scenarios: RunSnapshot[];
};

/**
 * 物化编排：按 items 顺序解析每个 lane 的剧本（跨渠道允许），
 * lane 内步骤经 runs 的 materializeRunSnapshot 逐字节拼装明文载荷。
 * 空编排 / 剧本不存在 / 步骤引用失效都拒绝启动。
 */
export function materializePlanRun(input: {
  plan: Plan;
  scenarios: readonly Scenario[];
  events: readonly EventItem[];
  startedAt: string;
}): PlanRunSnapshot {
  const { plan, scenarios, events, startedAt } = input;
  if (plan.items.length === 0) {
    throw new Error("编排还没有剧本，先添加已保存剧本再运行。");
  }
  const lanes = plan.items.map((item, lane) => {
    const scenario = resolveLaneScenario(item, scenarios);
    // 运行时钟问 interpreter（events 域唯一分岔点；存在性引用：快照优先解析
    // 命中即放行，双缺即拦截；文案一字不动）。后半为类型收窄，语义以解释为准。
    if (
      interpretPresence(scenario !== undefined, "runtime").blocks ||
      !scenario
    ) {
      throw new Error(
        `编排第 ${lane + 1} 条引用的剧本不存在：${item.scenarioId}。先移除该剧本或调整剧本库。`,
      );
    }
    try {
      return materializeRunSnapshot({
        scenario,
        events,
        startedAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `剧本「${scenario.name}」（编排第 ${lane + 1} 条）无法运行：${message}`,
      );
    }
  });
  return {
    runId: newPlanRunId(),
    planId: plan.id,
    planName: plan.name,
    mode: plan.mode,
    failure: plan.failure,
    startedAt,
    scenarios: lanes,
  };
}
