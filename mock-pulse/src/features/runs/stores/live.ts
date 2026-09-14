import { createAction } from "@reduxjs/toolkit";

import type { ChannelId } from "@/lib/channels";

import type { RunRecord, RunStep } from "../model";

/**
 * 运行实况投影（单一出口）：Rust 执行器经 run-progress 事件实时回报，
 * 组合根只 dispatch 一次 runProgress，事件按 runId + lane 收敛到唯一的
 * LiveRun 状态（runs.live）。剧本运行是 lanes 长度 1 的特例；编排运行
 * 每个 lane 对应一个剧本。finished 由 runs 域收束（历史入列 + 实况清空）；
 * plans 域监听同一组 action 只做编排运行的阶段簿记，实况展示经
 * selectLiveRunFor / selectPlanLiveRun 从本域派生。
 */

/** 进行中运行的步骤状态（run-progress 事件驱动） */
export type LiveStepStatus =
  | "pending"
  | "waiting"
  | "success"
  | "failed"
  | "skipped";

/** 进行中运行的一个步骤：完成前只有事件名与状态，完成后携带快照 */
export type LiveStep = {
  eventName: string;
  status: LiveStepStatus;
  step?: RunStep;
};

/** 进行中运行的一条 lane（= 一个剧本；剧本运行只有一条） */
export type LiveLane = {
  name: string;
  channel?: ChannelId;
  steps: LiveStep[];
};

/** 实况来源：剧本运行 / 编排运行 */
export type LiveRunKind = "scenario" | "plan";

/** 进行中的运行（runs 域持有，全应用唯一实况投影） */
export type LiveRun = {
  runId: string;
  kind: LiveRunKind;
  /** 来源剧本 / 编排 id */
  sourceId?: string;
  /** 来源名快照（剧本名或编排名） */
  name: string;
  /** 执行方式（剧本运行恒为 serial） */
  mode: "serial" | "parallel";
  /** 编排失败策略 */
  failure?: "stop" | "continue";
  startedAt: string;
  lanes: LiveLane[];
};

/** run-progress 事件载荷（Rust RunProgressEvent 的 camelCase 形态，单一源） */
export type RunProgressPayload = {
  runId: string;
  index: number;
  status: "waiting" | "success" | "failed" | "skipped" | "finished";
  /** 编排运行：进度所属 lane 序号（剧本运行/finished 无此字段） */
  lane?: number;
  /** 完成态（success/failed）携带完整步骤快照 */
  step?: RunStep;
  /** finished 携带完整运行记录 */
  run?: RunRecord;
  /** 完成记录落盘失败时保留快照并允许重试 */
  error?: string | null;
};

/** 运行启动即投影（live 在 IPC 前初始化，供立即停止与实时进度） */
export const liveStarted = createAction<LiveRun>("runs/liveStarted");

/** 启动失败撤回投影（runs 侧无法感知 plans 域的 IPC 失败，由 thunk 显式撤回） */
export const liveCleared = createAction<{ runId: string }>("runs/liveCleared");

/** 组合根唯一消费的投影 action：run-progress 事件 → 实况收敛 */
export const runProgress = createAction<RunProgressPayload>("runs/progress");

/** 投影种子：各运行域从自己的快照给出 lane 事实，这里统一产出空实况 */
export type LiveRunSeed = {
  kind: LiveRunKind;
  runId: string;
  sourceId?: string;
  name: string;
  startedAt: string;
  mode?: "serial" | "parallel";
  failure?: "stop" | "continue";
  lanes: readonly {
    name: string;
    channel?: ChannelId;
    eventNames: readonly string[];
  }[];
};

/** 种子 → 实况（每 lane 每步 pending） */
export function liveRunFromLanes(seed: LiveRunSeed): LiveRun {
  return {
    runId: seed.runId,
    kind: seed.kind,
    ...(seed.sourceId === undefined ? {} : { sourceId: seed.sourceId }),
    name: seed.name,
    mode: seed.mode ?? "serial",
    ...(seed.failure === undefined ? {} : { failure: seed.failure }),
    startedAt: seed.startedAt,
    lanes: seed.lanes.map((lane) => ({
      name: lane.name,
      ...(lane.channel === undefined ? {} : { channel: lane.channel }),
      steps: lane.eventNames.map((eventName) => ({
        eventName,
        status: "pending" as const,
      })),
    })),
  };
}

/**
 * 进度事件应用（finished 之外的步骤状态收敛，就地修改——reducer 在
 * RTK Immer 内调用）：按 lane 路由，缺省 lane 0（剧本运行）；编排运行的
 * 事件必须携带 lane（剧本事件不串场），否则忽略。
 */
export function applyLiveProgress(
  live: LiveRun,
  payload: RunProgressPayload,
): void {
  if (payload.status === "finished") return;
  if (live.kind === "plan" && payload.lane === undefined) return;
  const target = live.lanes[payload.lane ?? 0]?.steps[payload.index];
  if (!target) return;
  target.status = payload.status;
  if (payload.step) {
    target.step = payload.step;
  }
}

/** 实况状态的最小形状（RunsState 结构化子集，避免反向依赖 slice） */
type LiveState = { live: LiveRun | null };

export function selectLiveRun(state: LiveState): LiveRun | null {
  return state.live;
}

/** 按来源取实况：编辑器据此判断「这个剧本/编排是否正在运行」 */
export function selectLiveRunFor(
  state: LiveState,
  kind: LiveRunKind,
  sourceId: string,
): LiveRun | null {
  const live = state.live;
  return live && live.kind === kind && live.sourceId === sourceId ? live : null;
}
