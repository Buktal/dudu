import { createAsyncThunk } from "@reduxjs/toolkit";

import {
  canStartRun,
  launchProjectedRun,
  liveFromPlanSnapshot,
  type PlanSnapshotLike,
  type ProjectedOutcome,
} from "@/features/runs";
import type { RootState } from "@/store";

import { startPlanRun as startPlanRunApi } from "../api";
import { materializePlanRun, type PlanRunSnapshot } from "../materialize";
import { resolveLaneScenario } from "../model";

// 编译期契约：编排快照满足 runs 实况所需的最小形状（单点见 plan-adapter.ts）。
type _PlanSnapshotConformsToLive = PlanRunSnapshot extends PlanSnapshotLike
  ? true
  : never;
const _planSnapshotConformsToLive: _PlanSnapshotConformsToLive = true;
void _planSnapshotConformsToLive;

/**
 * 编排运行流：引用整形与校验在此，启动顺序（门禁 → 物化 → 投影 →
 * invoke）在运行启动模块（runs 域 launch.ts）收敛，直发 / 剧本 /
 * 编排三条路径共用同一顺序。进度由 run-progress 驱动（实况投影与
 * 启动骨架在 runs 域 live.ts，展示经 runs 的 selectLiveRunFor 派生）。
 * 启动互斥由运行会话模块裁决。
 */

/** 启动编排运行（当前选中的编排草稿）：引用剧本不存在时拒绝启动
 *  （拒绝单点在 materializePlanRun 的不变式守卫，此处不重复校验）。
 *  结果即统一词汇的投影子集（runs 域拥有），本域只做引用整形。 */
export const startPlanRun = createAsyncThunk<
  ProjectedOutcome,
  void,
  { state: RootState }
>(
  "plans/start",
  async (_, { getState, dispatch }) => {
    const plan = getState().plans.draft;
    if (!plan) {
      return { kind: "noop" as const };
    }
    // 单次状态快照：门禁输入与物化读同一份剧本/事件表，门禁与快照之间
    // 不因二次读取漂移。lane 存在性校验只保留 materializePlanRun 一处
    // （含用户可达文案），启动路径不再三层重复校验。
    const state = getState();
    const laneScenarios = plan.items.map((item) =>
      resolveLaneScenario(item, state.scenarios.items),
    );
    // 连接门输入：去重后的渠道（未配置给「前往平台连接」指引）；悬空 lane
    // 解析不到剧本、无渠道可贡献，拒绝启动由物化守卫负责
    const channels = [
      ...new Set(
        laneScenarios.flatMap((scenario) =>
          scenario ? [scenario.channelId] : [],
        ),
      ),
    ];
    return launchProjectedRun(
      {
        channels,
        // 物化快照（启动时固化，Rust 不感知素材库/剧本/编排概念）
        materialize: () =>
          materializePlanRun({
            plan,
            scenarios: state.scenarios.items,
            events: state.events.items,
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
