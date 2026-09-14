import { createAsyncThunk } from "@reduxjs/toolkit";

import type { RootState } from "@/store";

import { startScenarioRun as startScenarioRunApi } from "../api";
import {
  materializeRunSnapshot,
  type RunSnapshot,
  type SnapshotSource,
} from "../snapshot";
import { type LiveRun, liveRunFromLanes, liveStarted } from "./live";
import { canStartRun, missingConnections, type RunPhase } from "./session";

/**
 * 剧本运行流：调用方（scenarios 域组件）把用例数据作为 payload 传入
 * （runs 域对 scenarios 零依赖）→ 物化快照（启动时固化，后续编辑不影响）
 * → invoke Rust 执行器（命令立即返回 run id）→ 进度由 run-progress 事件
 * 驱动实况投影（live.ts）。启动互斥由运行会话模块裁决（session.ts）。
 */

/** 剧本运行阶段（RunPhase 的剧本别名，供既有消费方沿用） */
export type ScenarioRunPhase = RunPhase;

/** 启动载荷：用例数据由调用方传入（剧本快照 + 可选单步索引） */
export type StartScenarioRunPayload = {
  scenario: SnapshotSource;
  stepIndex?: number;
};

/** 剧本运行结果：正常返回 noop/needConnection 分支或 started（异常走 rejected） */
type ScenarioRunResult =
  | { kind: "noop" }
  | { kind: "needConnection" }
  | { kind: "started"; live: LiveRun };

/** 快照 → 实况（单 lane，每步 pending，携带事件名与渠道供实时展示） */
function liveFromSnapshot(snapshot: RunSnapshot): LiveRun {
  return liveRunFromLanes({
    kind: "scenario",
    runId: snapshot.runId,
    sourceId: snapshot.scenarioId,
    name: snapshot.scenarioName,
    startedAt: snapshot.startedAt,
    lanes: [
      {
        name: snapshot.scenarioName,
        channel: snapshot.steps[0]?.channel,
        eventNames: snapshot.steps.map((step) => step.eventName),
      },
    ],
  });
}

/** 启动剧本运行（用例数据由调用方传入；无 payload 为空操作）。 */
export const startScenarioRun = createAsyncThunk<
  ScenarioRunResult,
  StartScenarioRunPayload | undefined,
  { state: RootState }
>(
  "runs/startScenario",
  async (payload, { getState, dispatch }) => {
    const state = getState();
    const scenario = payload?.scenario;
    if (!scenario) {
      return { kind: "noop" };
    }
    const connection = state.connections.items[scenario.channelId];
    // 未配置连接（缺条目/缺地址/缺凭据）：不报错，给「前往平台连接」指引
    if (missingConnections(state, [scenario.channelId]).length > 0) {
      return { kind: "needConnection" };
    }
    if (payload.stepIndex !== undefined && !scenario.steps[payload.stepIndex]) {
      throw new Error("找不到要发送的步骤。");
    }
    const snapshot = materializeRunSnapshot({
      scenario:
        payload.stepIndex === undefined
          ? scenario
          : {
              ...scenario,
              steps: [{ ...scenario.steps[payload.stepIndex], wait: 0 }],
            },
      events: state.events.items,
      startedAt: new Date().toISOString(),
    });
    // 命令立即返回（run id 即 snapshot.runId）；进度由 run-progress 事件驱动
    const live = liveFromSnapshot(snapshot);
    dispatch(liveStarted(live));
    await startScenarioRunApi(snapshot, [connection]);
    return { kind: "started", live };
  },
  {
    condition: (_, { getState }) => canStartRun(getState()).ok,
  },
);
