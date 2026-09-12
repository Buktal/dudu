import type { EventItem, EventVersion } from "@/features/events";
import { type ChannelId, channelById } from "@/lib/channels";

import type { Scenario, ScenarioStep } from "./model";

/** 剧本筛选：搜索 + 渠道（纯 selector，列表渲染交给 react-virtuoso） */
export type ScenarioFilters = {
  query: string;
  channel: ChannelId | "all";
};

export const PAGE_SIZE = 10;

export type ScenarioRow = {
  scenario: Scenario;
  /** 渠道未注册时的兜底显示名 */
  channelName: string;
  stepCount: number;
};

function searchableText(row: ScenarioRow): string {
  return `${row.scenario.name} ${row.scenario.channelId} ${row.channelName}`.toLowerCase();
}

/** 筛选（保持库内原顺序：剧本无时间戳，按装载/保存顺序稳定呈现）。 */
export function filterScenarios(
  items: Scenario[],
  filters: ScenarioFilters,
): ScenarioRow[] {
  const rows: ScenarioRow[] = items.map((scenario) => ({
    scenario,
    channelName: channelById(scenario.channelId)?.name ?? scenario.channelId,
    stepCount: scenario.steps.length,
  }));
  const query = filters.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (
      filters.channel !== "all" &&
      row.scenario.channelId !== filters.channel
    ) {
      return false;
    }
    return query === "" || searchableText(row).includes(query);
  });
}

export type ScenarioPage = {
  items: ScenarioRow[];
  page: number;
  pages: number;
  total: number;
};

/** 分页（页码收敛到 [1, pages]；空列表为第 1 页）。页大小固定 PAGE_SIZE。 */
export function paginateScenarios(
  rows: ScenarioRow[],
  page: number,
): ScenarioPage {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const clamped = Math.max(1, Math.min(page, pages));
  return {
    items: rows.slice((clamped - 1) * PAGE_SIZE, clamped * PAGE_SIZE),
    page: clamped,
    pages,
    total: rows.length,
  };
}

/** 步骤引用解析结果：四行语义中「发的内容 / 期待的回执」的数据源。 */
export type StepRow = {
  index: number;
  step: ScenarioStep;
  /** 引用的事件（missing 时为 undefined） */
  event: EventItem | undefined;
  /** 引用的版本（事件缺该版本号时为 undefined） */
  referenced: EventVersion | undefined;
  /** 事件最新版本号（无版本事件为 0） */
  latestRevision: number;
  /** 引用落后于最新版本 → UI 提示「有新版本」 */
  outdated: boolean;
  /** 事件库中已不存在该事件（删除被拒的正常流程不会出现，防御显示） */
  missing: boolean;
};

/**
 * 把步骤的 {eventId, revision} 引用解析为展示行：
 * 「有新版本」= 事件最新版本号 > 步骤引用的版本号。
 */
export function resolveSteps(
  steps: ScenarioStep[],
  events: EventItem[],
): StepRow[] {
  return steps.map((step, index) => {
    const event = events.find((item) => item.id === step.eventId);
    const latest = event?.versions[event.versions.length - 1];
    const latestRevision = latest?.revision ?? 0;
    const referenced = event?.versions.find(
      (version) => version.revision === step.revision,
    );
    return {
      index,
      step,
      event,
      referenced,
      latestRevision,
      outdated: Boolean(referenced) && latestRevision > step.revision,
      missing: !event,
    };
  });
}
