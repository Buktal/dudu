import { createAsyncThunk } from "@reduxjs/toolkit";

import {
  canStartRun,
  type LiveRun,
  liveFromPlanSnapshot,
  missingConnections,
  startLiveRun,
} from "@/features/runs";
import type { ChannelId } from "@/lib/channels";
import type { RootState } from "@/store";

import { startPlanRun as startPlanRunApi } from "../api";
import { materializePlanRun } from "../materialize";
import { resolveLaneScenario, validatePlan } from "../model";

/**
 * 编排运行流：校验引用 → 连接就绪检查（去重渠道，经 runs 域运行会话
 * 模块的连接门）→ 物化快照（启动时固化）→ invoke Rust 执行器 → 命令
 * 立即返回 run id，进度由 run-progress 驱动（实况投影与启动骨架在
 * runs 域 live.ts，展示经 runs 的 selectLiveRunFor 派生）。启动互斥由
 * 运行会话模块裁决。
 */

/** 编排运行结果：正常返回 noop/needConnection 分支或 started（异常走 rejected） */
export type PlanRunResult =
  | { kind: "noop" }
  | { kind: "needConnection"; channels: ChannelId[] }
  | { kind: "started"; live: LiveRun };

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
    // 启动骨架（runs 域 live.ts）：命令立即返回（run id 即 snapshot.runId），
    // 进度由 run-progress 事件驱动，IPC 失败由骨架撤回投影
    const live = liveFromPlanSnapshot(snapshot);
    await startLiveRun(live, dispatch, () =>
      startPlanRunApi(snapshot, connections),
    );
    return { kind: "started" as const, live };
  },
  {
    condition: (_, { getState }) => canStartRun(getState()).ok,
  },
);
