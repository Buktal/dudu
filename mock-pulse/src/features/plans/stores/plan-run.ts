import { createAsyncThunk } from "@reduxjs/toolkit";

import {
  canStartRun,
  type LiveRun,
  liveCleared,
  liveRunFromLanes,
  liveStarted,
  missingConnections,
} from "@/features/runs";
import type { ChannelId } from "@/lib/channels";
import type { RootState } from "@/store";

import { startPlanRun as startPlanRunApi } from "../api";
import { materializePlanRun, type PlanRunSnapshot } from "../materialize";
import { resolveLaneScenario, validatePlan } from "../model";

/**
 * 编排运行流：校验引用 → 连接就绪检查（去重渠道，经 runs 域运行会话
 * 模块的连接门）→ 物化快照（启动时固化）→ invoke Rust 执行器 → 命令
 * 立即返回 run id，进度由 run-progress 驱动（实况投影在 runs 域 live.ts，
 * 本域只经 selectPlanLiveRun 派生展示）。启动互斥由运行会话模块裁决。
 */

/** 编排运行结果：正常返回 noop/needConnection 分支或 started（异常走 rejected） */
export type PlanRunResult =
  | { kind: "noop" }
  | { kind: "needConnection"; channels: ChannelId[] }
  | { kind: "started"; live: LiveRun };

/** 快照 → 实况（每 lane 每步 pending，lane = 一个剧本） */
function liveFromSnapshot(snapshot: PlanRunSnapshot): LiveRun {
  return liveRunFromLanes({
    kind: "plan",
    runId: snapshot.runId,
    sourceId: snapshot.planId,
    name: snapshot.planName,
    mode: snapshot.mode,
    failure: snapshot.failure,
    startedAt: snapshot.startedAt,
    lanes: snapshot.scenarios.map((scenario) => ({
      name: scenario.scenarioName,
      channel: scenario.steps[0]?.channel,
      eventNames: scenario.steps.map((step) => step.eventName),
    })),
  });
}

/** 启动编排运行（当前选中的编排草稿）：引用剧本不存在时拒绝启动。 */
export const startPlanRun = createAsyncThunk<
  PlanRunResult,
  void,
  { state: RootState }
>(
  "plans/start",
  async (_, { getState, dispatch }) => {
    const state = getState();
    const plan = state.plans.draft;
    if (!plan) {
      return { kind: "noop" as const };
    }
    validatePlan(plan, state.scenarios.items);
    const laneScenarios = plan.items.map((item) => {
      const scenario = resolveLaneScenario(item, state.scenarios.items);
      if (!scenario) {
        throw new Error(`编排引用的剧本不存在：${item.scenarioId}。`);
      }
      return scenario;
    });
    // 连接就绪检查：去重后的渠道逐一确认（未配置给「前往平台连接」指引）
    const channels = [
      ...new Set(laneScenarios.map((scenario) => scenario.channelId)),
    ];
    const missing = missingConnections(state, channels);
    if (missing.length > 0) {
      return { kind: "needConnection" as const, channels: missing };
    }
    const snapshot = materializePlanRun({
      plan,
      scenarios: state.scenarios.items,
      events: state.events.items,
      startedAt: new Date().toISOString(),
    });
    const connections = channels.map(
      (channel) => state.connections.items[channel],
    );
    // 命令立即返回（run id 即 snapshot.runId）；进度由 run-progress 事件驱动。
    // live 在 IPC 前投影（供立即停止与实时进度）；runs 侧无法感知本域的
    // IPC 失败，启动失败时显式撤回投影。
    const live = liveFromSnapshot(snapshot);
    dispatch(liveStarted(live));
    try {
      await startPlanRunApi(snapshot, connections);
    } catch (error) {
      dispatch(liveCleared({ runId: snapshot.runId }));
      throw error;
    }
    return { kind: "started" as const, live };
  },
  {
    condition: (_, { getState }) => canStartRun(getState()).ok,
  },
);

/** 编排实况派生 selector：实况本体在 runs 域，这里按 planId 取本编排的
 *  进行中实况（其余编排/剧本运行的实况不串场）。 */
export function selectPlanLiveRun(
  state: { runs: { live: LiveRun | null } },
  planId: string,
): LiveRun | null {
  const live = state.runs.live;
  return live && live.kind === "plan" && live.sourceId === planId ? live : null;
}
