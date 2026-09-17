import type { ChannelId } from "@/lib/channels";

import type { RunPhase } from "./session";

/**
 * plans → runs 适配单点（runs 拥有）：runs 侧所需的 plans 最小形状唯一定义。
 * 原先散在两处的手写结构化子集（session 的 PlanRunSliceLike、live 的
 * PlanRunSnapshotLike）在此收敛；plans 域经门面 import 本模块声明 conformance，
 * runs 侧不再各自重写 Like。本文件不 import plans（类型与运行时皆无），只收
 * 结构化最小形状——运行时方向保持 plans → runs，store.ts 方向不变。
 * lane 翻译（planLaneFacts）亦单点在此，live 的两个快照 builder 共用。
 */

/** plans 运行片段最小形状（会话互斥所需：编排 phase） */
export type PlanPhaseLike = { planRunPhase: RunPhase };

/** lane 事实最小形状（RunSnapshot / 编排快照的 scenarios 共用结构子集） */
export type PlanLaneScenarioLike = {
  scenarioName: string;
  steps: readonly { channel: ChannelId; eventName: string }[];
};

/** 编排快照最小形状（实况种子所需：原 live 的 PlanRunSnapshotLike） */
export type PlanSnapshotLike = {
  runId: string;
  planId: string;
  planName: string;
  mode: "serial" | "parallel";
  failure: "stop" | "continue";
  startedAt: string;
  scenarios: readonly PlanLaneScenarioLike[];
};

/** lane 事实 → 实况种子 lane（首步渠道 + 每步事件名） */
export function planLaneFacts(scenario: PlanLaneScenarioLike): {
  name: string;
  channel?: ChannelId | undefined;
  eventNames: readonly string[];
} {
  return {
    name: scenario.scenarioName,
    channel: scenario.steps[0]?.channel,
    eventNames: scenario.steps.map((step) => step.eventName),
  };
}
