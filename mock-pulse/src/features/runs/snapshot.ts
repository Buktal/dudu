import {
  describeEventVersion,
  describeTemplateVersion,
  EVENT_SCHEMAS,
  type EventItem,
  type EventSchema,
  type ExpectedReceipt,
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

/** 快照物化所需的步骤引用（ScenarioStep 的结构子集：两种形态并列） */
export type SnapshotStep =
  | { eventId: string; revision: number; wait?: number }
  | { templateId: string; templateVersion: string; wait?: number };

/** 快照物化所需的剧本形状（Scenario 的结构子集） */
export type SnapshotSource = {
  id: string;
  name: string;
  channelId: ChannelId;
  steps: readonly SnapshotStep[];
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

/** 注册表内同 id 模板的展示名（缺失语义错误文案用） */
function templateName(templates: readonly EventSchema[], id: string): string {
  return templates.find((item) => item.id === id)?.name ?? id;
}

/**
 * 物化剧本步骤为运行快照。解析失败（空步骤/悬空引用/缺版本/跨渠道/
 * 模板未注册或钉住版本不在注册表）抛可读错误，不产出半成品快照。
 */
export function materializeRunSnapshot(input: {
  scenario: SnapshotSource;
  events: readonly EventItem[];
  /** 模板注册表（模板步骤的解析事实源）；缺省用内置注册表 */
  templates?: readonly EventSchema[];
  startedAt: string;
}): RunSnapshot {
  const { scenario, events, startedAt } = input;
  const templates = input.templates ?? EVENT_SCHEMAS;
  if (scenario.steps.length === 0) {
    throw new Error("剧本还没有步骤，先添加已保存事件或内置模板再运行。");
  }
  const steps = scenario.steps.map((step, index) => {
    if ("templateId" in step) {
      // 模板引用分类共用（events 域 describeTemplateVersion：未注册 id 与
      // 钉住版本不在注册表的区分住在数据侧）；缺失语义（抛可读错误，
      // 拒绝启动）留在本运行时钟。
      const status = describeTemplateVersion(templates, step);
      if (status.status !== "ok") {
        if (status.status === "template-missing") {
          throw new Error(
            `第 ${index + 1} 步引用的内置模板不存在：${step.templateId}。先删除该步骤或更新剧本。`,
          );
        }
        throw new Error(
          `第 ${index + 1} 步引用的模板版本不存在：${templateName(templates, step.templateId)} v${step.templateVersion}。`,
        );
      }
      const template = status.template;
      if (template.channelId !== scenario.channelId) {
        throw new Error(
          `第 ${index + 1} 步引用了${channelName(template.channelId)}的内置模板：${template.id}（剧本渠道为${channelName(scenario.channelId)}）。`,
        );
      }
      return {
        eventName: template.name,
        eventId: template.id,
        channel: template.channelId,
        expected: { ...template.expected },
        // 纯引用（ADR-0009）：钉住版本的默认载荷原样发送，不重生成 ID
        body: wireBodyText(template, template.payload),
        ...(step.wait === undefined ? {} : { wait: step.wait }),
      };
    }
    // 引用分类共用（events 域 describeEventVersion）；缺失语义（抛错
    // 拒绝启动、不产半成品快照）留在本运行时钟。
    const refStatus = describeEventVersion(events, step);
    if (refStatus.status === "event-missing") {
      throw new Error(
        `第 ${index + 1} 步引用的事件不存在：${step.eventId}。先删除该步骤或调整素材库。`,
      );
    }
    const event = refStatus.event;
    if (event.channelId !== scenario.channelId) {
      throw new Error(
        `第 ${index + 1} 步引用了${channelName(event.channelId)}的事件：${event.name}（剧本渠道为${channelName(scenario.channelId)}）。`,
      );
    }
    if (refStatus.status === "revision-missing") {
      throw new Error(
        `第 ${index + 1} 步引用的版本不存在：${event.name} v${step.revision}。`,
      );
    }
    const referenced = refStatus.version;
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
