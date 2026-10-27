import { createAsyncThunk } from "@reduxjs/toolkit";
import {
  EVENT_SCHEMAS,
  type EventItem,
  type EventsState,
  type EventVersion,
  interpretPresence,
  latestVersionOf,
  schemaById,
} from "@/features/events";
import { draftSnapshot } from "@/lib/draft-snapshot";

import {
  deleteScenarioById as deleteScenarioApi,
  loadScenarios,
  saveScenario as saveScenarioApi,
} from "../api";
import {
  addStep,
  addTemplateStep,
  assertSameChannel,
  isTemplateStep,
  newScenarioId,
  type Scenario,
  validateScenario,
  withStepRevision,
} from "../model";
import type { ScenariosState } from "./scenarios-slice";

type ScenariosRoot = { scenarios: ScenariosState; events: EventsState };

/** 装载已保存剧本为独立草稿副本（编辑不影响库内对象）。 */
export function draftFromScenario(item: Scenario): Scenario {
  return { ...item, steps: item.steps.map((step) => ({ ...step })) };
}

/**
 * 素材库查事件并取其当前可引用的最新版本（添加步骤 / 同步引用共用）：
 * 事件不存在或从未保存过版本时抛可读错误。
 */
function referencedVersionOf(
  events: EventsState["items"],
  eventId: string,
): { event: EventItem; version: EventVersion } {
  const event = events.find((item) => item.id === eventId);
  // 编辑时钟（同步门）问 interpreter（events 域唯一分岔点）：无行即 id 缺失，
  // 拒绝同步（文案一字不动）；命中带回主语
  const verdict = interpretPresence(event, "edit");
  if (verdict.blocked) {
    throw new Error(`事件不存在：${eventId}。`);
  }
  // 取尖单点在 events 域 latestVersionOf（与 interpreter/model 同源）
  const version = latestVersionOf(verdict.row);
  // 非引用分类边：行在但零版本（无 ref 可判，不归表），文案不变。
  if (!version) {
    throw new Error(`事件还没有保存过版本：${verdict.row.name}。`);
  }
  return { event: verdict.row, version };
}

export const fetchScenarios = createAsyncThunk("scenarios/fetch", async () =>
  loadScenarios(),
);

/**
 * 添加步骤：从素材库按事件 id 引用最新版本；
 * 领域层校验渠道一致（ADR-0004 禁混写），违例拒绝并给可读错误。
 */
export const addScenarioStep = createAsyncThunk(
  "scenarios/addStep",
  async ({ eventId }: { eventId: string }, { getState }) => {
    const { scenarios, events } = getState() as ScenariosRoot;
    const draft = scenarios.draft;
    if (!draft) {
      throw new Error("没有正在编辑的剧本。");
    }
    const { event, version } = referencedVersionOf(events.items, eventId);
    return addStep(draft, {
      id: event.id,
      channelId: event.channelId,
      revision: version.revision,
    });
  },
);

export const replaceScenarioStep = createAsyncThunk(
  "scenarios/replaceStep",
  async (
    { index, eventId }: { index: number; eventId: string },
    { getState },
  ) => {
    const { scenarios, events } = getState() as ScenariosRoot;
    const draft = scenarios.draft;
    if (!draft?.steps[index]) throw new Error("找不到要替换的步骤。");
    const { event, version } = referencedVersionOf(events.items, eventId);
    assertSameChannel(draft.channelId, event.channelId);
    return {
      ...draft,
      steps: draft.steps.map((step, i) =>
        i === index
          ? {
              eventId,
              revision: version.revision,
              ...(step.wait === undefined ? {} : { wait: step.wait }),
            }
          : step,
      ),
    };
  },
);

/**
 * 添加内置模板步骤（ADR-0009 纯引用）：从注册表取模板并钉住其当前版本；
 * 领域层校验渠道一致，违例拒绝并给可读错误。
 */
export const addScenarioTemplateStep = createAsyncThunk(
  "scenarios/addTemplateStep",
  async ({ templateId }: { templateId: string }, { getState }) => {
    const { scenarios } = getState() as ScenariosRoot;
    const draft = scenarios.draft;
    if (!draft) {
      throw new Error("没有正在编辑的剧本。");
    }
    const template = schemaById(templateId);
    return addTemplateStep(draft, {
      id: template.id,
      channelId: template.channelId,
      version: template.version,
    });
  },
);

/** 替换为内置模板步骤：保留等待秒数，钉住模板当前版本（不残留事件引用）。 */
export const replaceScenarioTemplateStep = createAsyncThunk(
  "scenarios/replaceTemplateStep",
  async (
    { index, templateId }: { index: number; templateId: string },
    { getState },
  ) => {
    const { scenarios } = getState() as ScenariosRoot;
    const draft = scenarios.draft;
    if (!draft?.steps[index]) throw new Error("找不到要替换的步骤。");
    const template = schemaById(templateId);
    assertSameChannel(draft.channelId, template.channelId);
    return {
      ...draft,
      steps: draft.steps.map((step, i) =>
        i === index
          ? {
              templateId: template.id,
              templateVersion: template.version,
              ...(step.wait === undefined ? {} : { wait: step.wait }),
            }
          : step,
      ),
    };
  },
);

export const saveScenarioAs = createAsyncThunk(
  "scenarios/saveAs",
  async (name: string, { getState }) => {
    const { scenarios, events } = getState() as ScenariosRoot;
    if (!scenarios.draft) throw new Error("没有可保存的剧本草稿。");
    const copy = {
      ...draftFromScenario(scenarios.draft),
      id: newScenarioId(),
      name: name.trim(),
      revision: 1,
      favorite: false,
    };
    validateScenario(copy, events.items, EVENT_SCHEMAS);
    return {
      items: await saveScenarioApi(copy),
      copy,
      source: draftSnapshot(scenarios.draft),
    };
  },
);

/** 显式同步单个事件步骤的引用到事件最新版本（模板步骤钉住，原样返回）。 */
export const syncScenarioStep = createAsyncThunk(
  "scenarios/syncStep",
  async ({ index }: { index: number }, { getState }) => {
    const { scenarios, events } = getState() as ScenariosRoot;
    const draft = scenarios.draft;
    if (!draft) {
      throw new Error("没有正在编辑的剧本。");
    }
    const step = draft.steps[index];
    if (!step) {
      throw new Error(`步骤不存在：第 ${index + 1} 步。`);
    }
    // 模板步骤为版本钉住（ADR-0009），无「同步到最新」语义
    if (isTemplateStep(step)) {
      return draft;
    }
    const { version } = referencedVersionOf(events.items, step.eventId);
    return withStepRevision(draft, index, version.revision);
  },
);

/** 整体同步：把所有事件步骤引用更新到最新版本（模板步骤钉住不动）。 */
export const syncAllScenarioSteps = createAsyncThunk(
  "scenarios/syncAll",
  async (_, { getState }) => {
    const { scenarios, events } = getState() as ScenariosRoot;
    const draft = scenarios.draft;
    if (!draft) {
      throw new Error("没有正在编辑的剧本。");
    }
    let updated = draft;
    for (const [index, step] of draft.steps.entries()) {
      if (isTemplateStep(step)) continue;
      const { version } = referencedVersionOf(events.items, step.eventId);
      updated = withStepRevision(updated, index, version.revision);
    }
    return updated;
  },
);

/** 保存草稿：整体校验（防绕过 addStep 的走私步骤，模板步骤对照内置注册表）后持久化 */
export const saveScenario = createAsyncThunk(
  "scenarios/save",
  async (_, { getState }) => {
    const { scenarios, events } = getState() as ScenariosRoot;
    const draft = scenarios.draft;
    if (!draft) {
      throw new Error("没有可保存的剧本草稿。");
    }
    validateScenario(draft, events.items, EVENT_SCHEMAS);
    const previous = scenarios.items.find((item) => item.id === draft.id);
    return saveScenarioApi({
      ...draft,
      // 行在而 revision 缺失（旧文件未写版本号）按首版重计，不跳号
      revision: (previous?.revision ?? 0) + 1,
    });
  },
);

export const deleteScenario = createAsyncThunk(
  "scenarios/delete",
  async (scenarioId: string) => deleteScenarioApi(scenarioId),
);
