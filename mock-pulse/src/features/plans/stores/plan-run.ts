import { createAsyncThunk } from "@reduxjs/toolkit";

import {
  canStartRun,
  type LiveRun,
  launchProjectedRun,
  liveFromPlanSnapshot,
} from "@/features/runs";
import type { ChannelId } from "@/lib/channels";
import type { RootState } from "@/store";

import { startPlanRun as startPlanRunApi } from "../api";
import { materializePlanRun } from "../materialize";
import { resolveLaneScenario, validatePlan } from "../model";

/**
 * 编排运行流：引用整形与校验在此，启动顺序（门禁 → 物化 → 投影 →
 * invoke）在运行启动模块（runs 域 launch.ts）收敛，直发 / 剧本 /
 * 编排三条路径共用同一顺序。进度由 run-progress 驱动（实况投影与
 * 启动骨架在 runs 域 live.ts，展示经 runs 的 selectLiveRunFor 派生）。
 * 启动互斥由运行会话模块裁决。
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
    const plan = getState().plans.draft;
    if (!plan) {
      return { kind: "noop" as const };
    }
    validatePlan(plan, getState().scenarios.items);
    const laneScenarios = plan.items.map((item) => {
      const scenario = resolveLaneScenario(item, getState().scenarios.items);
      if (!scenario) {
        throw new Error(`编排引用的剧本不存在：${item.scenarioId}。`);
      }
      return scenario;
    });
    // 连接门输入：去重后的渠道（未配置给「前往平台连接」指引）
    const channels = [
      ...new Set(laneScenarios.map((scenario) => scenario.channelId)),
    ];
    return launchProjectedRun(
      {
        channels,
        // 物化快照（启动时固化，Rust 不感知素材库/剧本/编排概念）
        materialize: () =>
          materializePlanRun({
            plan,
            scenarios: getState().scenarios.items,
            events: getState().events.items,
            startedAt: new Date().toISOString(),
          }),
        toLive: liveFromPlanSnapshot,
        // 命令立即返回（run id 即 snapshot.runId），进度由 run-progress
        // 事件驱动，IPC 失败由骨架撤回投影
        invoke: (snapshot, connections) =>
          startPlanRunApi(snapshot, connections),
      },
      { getState, dispatch },
    );
  },
  {
    condition: (_, { getState }) => canStartRun(getState()).ok,
  },
);
