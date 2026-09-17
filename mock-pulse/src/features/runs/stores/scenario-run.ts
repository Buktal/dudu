import { createAsyncThunk } from "@reduxjs/toolkit";

import type { RootState } from "@/store";

import { startScenarioRun as startScenarioRunApi } from "../api";
import {
  materializeRunSnapshot,
  type SnapshotSource,
  snapshotSourceForStep,
} from "../snapshot";
import { launchProjectedRun, type ProjectedOutcome } from "./launch";
import { liveFromScenarioSnapshot } from "./live";
import { canStartRun, type RunPhase } from "./session";

/**
 * 剧本运行流：调用方（scenarios 域组件）把用例数据作为 payload 传入
 * （runs 域对 scenarios 零依赖）→ 启动顺序（门禁 → 物化 → 投影 →
 * invoke）在运行启动模块（launch.ts）收敛，直发 / 剧本 / 编排三条
 * 路径共用同一顺序。启动互斥由运行会话模块裁决（session.ts）。
 */

/** 剧本运行阶段（RunPhase 的剧本别名，供既有消费方沿用） */
export type ScenarioRunPhase = RunPhase;

/** 启动载荷：用例数据由调用方传入（剧本快照 + 可选单步索引） */
export type StartScenarioRunPayload = {
  scenario: SnapshotSource;
  stepIndex?: number;
};

/** 启动剧本运行（用例数据由调用方传入；无 payload 为空操作）。
 *  结果即统一词汇的投影子集，原样透传，不再各自映射。 */
export const startScenarioRun = createAsyncThunk<
  ProjectedOutcome,
  StartScenarioRunPayload | undefined,
  { state: RootState }
>(
  "runs/startScenario",
  async (payload, { getState, dispatch }) => {
    const scenario = payload?.scenario;
    if (!scenario) {
      return { kind: "noop" };
    }
    return launchProjectedRun(
      {
        channels: [scenario.channelId],
        // 物化快照（启动时固化，后续编辑不影响）。单步校验与切片收在
        // 物化内：连接门禁先行——缺连接回 needConnection，不抛步骤错
        //（门禁 → 物化顺序由 launchProjectedRun 拥有）。
        materialize: () =>
          materializeRunSnapshot({
            scenario: snapshotSourceForStep(scenario, payload.stepIndex),
            events: getState().events.items,
            startedAt: new Date().toISOString(),
          }),
        toLive: liveFromScenarioSnapshot,
        // 命令立即返回（run id 即 snapshot.runId），进度由 run-progress
        // 事件驱动，IPC 失败由骨架撤回投影
        invoke: (snapshot, connections) =>
          startScenarioRunApi(snapshot, connections),
      },
      { getState, dispatch },
    );
  },
  {
    condition: (_, { getState }) => canStartRun(getState()).ok,
  },
);
