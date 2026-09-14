import {
  type EventItem,
  type ExpectedReceipt,
  resolveEventVersion,
  schemaById,
  wireBodyText,
} from "@/features/events";
import { type ChannelId, channelById } from "@/lib/channels";

import { newRunId } from "./model";

/**
 * 快照物化（#20 架构锚点）：启动剧本运行时，前端把步骤引用解析成
 * 「已物化的运行快照」（纯数据：每步的渠道、事件名、期望回执、
 * 拼装好的明文载荷——wireBodyText 产出）。快照交给 Rust 执行器，
 * Rust 不感知素材库/剧本概念；启动后改草稿/改剧本/改事件不影响已启动的运行。
 * 输入用结构化类型（不引 scenarios 域，保持 runs 单向依赖）。
 */

/** 快照物化所需的剧本形状（Scenario 的结构子集） */
export type SnapshotSource = {
  id: string;
  name: string;
  channelId: ChannelId;
  steps: readonly { eventId: string; revision: number; wait?: number }[];
  failure?: "stop" | "continue";
};

/** 物化后的单个步骤（纯数据，与 Rust ScenarioStepSnapshot 对齐） */
export type RunStepSnapshot = {
  eventName: string;
  eventId: string;
  channel: ChannelId;
  expected: ExpectedReceipt;
  body: string;
  wait?: number;
};

/** 物化后的运行快照（与 Rust ScenarioRunSnapshot 对齐，camelCase IPC） */
export type RunSnapshot = {
  runId: string;
  scenarioId: string;
  scenarioName: string;
  startedAt: string;
  steps: RunStepSnapshot[];
  failure?: "stop" | "continue";
};

function channelName(channelId: ChannelId): string {
  return channelById(channelId)?.name ?? channelId;
}

/**
 * 物化剧本步骤为运行快照。解析失败（空步骤/悬空引用/缺版本/跨渠道）
 * 抛可读错误，不产出半成品快照。
 */
export function materializeRunSnapshot(input: {
  scenario: SnapshotSource;
  events: readonly EventItem[];
  startedAt: string;
}): RunSnapshot {
  const { scenario, events, startedAt } = input;
  if (scenario.steps.length === 0) {
    throw new Error("剧本还没有步骤，先添加已保存事件再运行。");
  }
  const steps = scenario.steps.map((step, index) => {
    // 引用解析核心共用（events 域 resolveEventVersion）；缺失语义（抛错
    // 拒绝启动、不产半成品快照）留在本运行时钟。
    const { event, version: referenced } = resolveEventVersion(events, step);
    if (!event) {
      throw new Error(
        `第 ${index + 1} 步引用的事件不存在：${step.eventId}。先删除该步骤或调整素材库。`,
      );
    }
    if (event.channelId !== scenario.channelId) {
      throw new Error(
        `第 ${index + 1} 步引用了${channelName(event.channelId)}的事件：${event.name}（剧本渠道为${channelName(scenario.channelId)}）。`,
      );
    }
    if (!referenced) {
      throw new Error(
        `第 ${index + 1} 步引用的版本不存在：${event.name} v${step.revision}。`,
      );
    }
    const schema = schemaById(event.schemaId);
    return {
      eventName: event.name,
      eventId: event.id,
      channel: event.channelId,
      expected: { ...referenced.expected },
      body: wireBodyText(schema, referenced.payload),
      ...(step.wait === undefined ? {} : { wait: step.wait }),
    };
  });
  return {
    runId: newRunId(),
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    startedAt,
    steps,
    ...(scenario.failure === undefined ? {} : { failure: scenario.failure }),
  };
}
