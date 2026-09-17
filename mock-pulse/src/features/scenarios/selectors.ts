import {
  type EventItem,
  type EventSchema,
  type EventVersion,
  interpretEventStep,
  interpretTemplateStep,
} from "@/features/events";
import { type ChannelId, channelById } from "@/lib/channels";
import { type Page, paginate as paginateList } from "@/lib/paginate";

import { isTemplateStep, type Scenario, type ScenarioStep } from "./model";

/** 剧本筛选：搜索 + 渠道（纯 selector，列表渲染交给 react-virtuoso） */
export type ScenarioFilters = {
  query: string;
  channel: ChannelId | "all";
  kind?: "all" | "favorite";
};

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
    if (filters.kind === "favorite" && !row.scenario.favorite) return false;
    if (
      filters.channel !== "all" &&
      row.scenario.channelId !== filters.channel
    ) {
      return false;
    }
    return query === "" || searchableText(row).includes(query);
  });
}

export type ScenarioPage = Page<ScenarioRow>;

/** 分页：转发 lib 泛型实现（页码收敛到 [1, pages]；空列表为第 1 页）。 */
export const paginateScenarios = paginateList;

/** 步骤引用解析结果：四行语义中「发的内容 / 期待的回执」的数据源。 */
export type StepRow = {
  index: number;
  step: ScenarioStep;
  /** 引用形态：event = 事件素材版本引用；template = 内置模板纯引用（ADR-0009） */
  kind: "event" | "template";
  /** 引用的事件（事件步骤 missing 时为 undefined） */
  event: EventItem | undefined;
  /** 引用的版本（事件缺该版本号时为 undefined） */
  referenced: EventVersion | undefined;
  /** 模板步骤解析出的钉住版本模板（未注册 id / 版本不在注册表时为 undefined） */
  template: EventSchema | undefined;
  /** 事件步骤：事件最新版本号（无版本事件为 0）；模板步骤恒 0（钉住，无同步语义） */
  latestRevision: number;
  /** 事件步骤：引用落后于最新版本 → UI 提示「有新版本」；模板步骤恒 false（钉住） */
  outdated: boolean;
  /** 引用缺失：事件不存在 / 模板未注册或钉住版本不在注册表 */
  missing: boolean;
};

/**
 * 把步骤引用解析为展示行：事件步骤按 {eventId, revision}，模板步骤按
 * {templateId, templateVersion}（版本钉住，无「有新版本」同步语义）。
 */
export function resolveSteps(
  steps: ScenarioStep[],
  events: EventItem[],
  templates: readonly EventSchema[] = [],
): StepRow[] {
  return steps.map((step, index) => {
    if (isTemplateStep(step)) {
      // 展示时钟问 interpreter（events 域唯一分岔点；版本钉住：只按步骤存下的
      // id + 版本精确解析，missing = 无条目，未注册 id 与版本更替同样 missing）。
      const interpreted = interpretTemplateStep(templates, step, "view");
      return {
        index,
        step,
        kind: "template",
        event: undefined,
        referenced: undefined,
        template: interpreted.entry,
        latestRevision: 0,
        outdated: false,
        missing: interpreted.missing,
      };
    }
    // 展示时钟问 interpreter（events 域唯一分岔点）：行与条目、missing·outdated
    // 都由解释直接给出。注意钉住版本不在（version-missing）不标 missing——行
    // 照常展示（表 view.hasRow 为 true），拒绝启动是运行时钟的事。
    const interpreted = interpretEventStep(events, step, "view");
    const latest =
      interpreted.row?.versions[interpreted.row.versions.length - 1];
    const latestRevision = latest?.revision ?? 0;
    return {
      index,
      step,
      kind: "event",
      event: interpreted.row,
      referenced: interpreted.entry,
      template: undefined,
      latestRevision,
      outdated: interpreted.outdated,
      missing: interpreted.missing,
    };
  });
}
