import { createAsyncThunk } from "@reduxjs/toolkit";

import type { ConnectionConfig } from "@/features/connections";
import { interpretPresence } from "@/features/events";
import type { Scenario } from "@/features/scenarios";

import {
  deletePlanById as deletePlanApi,
  loadPlans,
  savePlan as savePlanApi,
} from "../api";
import {
  addLane,
  newPlanId,
  type Plan,
  resolveLaneScenario,
  scenarioById,
  validatePlan,
} from "../model";

/**
 * 编排库链路 thunk：装载 / 草稿 lane 引用与同步 / 持久化与另存 / 删除 /
 * 收藏。slice 状态与运行链路分别在 plans-slice / plan-run。保存与编辑
 * 需要读取剧本库与连接配置，用结构化最小形状接收 getState（避免对
 * RootState 全量耦合）。
 */

/** 库链路的 getState 局部形状（结构化最小类型） */
type PlansRoot = {
  plans: { draft: Plan | null; items: Plan[] };
  scenarios: { items: Scenario[] };
  connections: { items: Record<string, ConnectionConfig> };
};

export const fetchPlans = createAsyncThunk("plans/fetch", async () =>
  loadPlans(),
);

/** 添加 lane：从剧本库按 id 引用剧本（跨渠道允许），剧本不存在拒绝。 */
export const addPlanLane = createAsyncThunk(
  "plans/addLane",
  async ({ scenarioId }: { scenarioId: string }, { getState }) => {
    const { plans, scenarios } = getState() as PlansRoot;
    const draft = plans.draft;
    if (!draft) {
      throw new Error("没有正在编辑的编排。");
    }
    const scenario = scenarios.items.find(
      (scenario) => scenario.id === scenarioId,
    );
    if (!scenario) {
      throw new Error(`剧本不存在：${scenarioId}。`);
    }
    return addLane(draft, scenarioId, scenario);
  },
);

export const syncPlanLane = createAsyncThunk(
  "plans/syncLane",
  async (index: number, { getState }) => {
    const { plans, scenarios } = getState() as PlansRoot;
    const draft = plans.draft;
    const item = draft?.items[index];
    // 同步语义：取库内最新版覆盖过期快照，故走库内查找而非 resolveLaneScenario。
    const scenario = item
      ? scenarioById(scenarios.items, item.scenarioId)
      : undefined;
    if (!draft || !item || !scenario)
      throw new Error("找不到该剧本，无法同步。");
    return {
      ...draft,
      items: draft.items.map((lane, i) =>
        i === index ? { ...lane, snapshot: structuredClone(scenario) } : lane,
      ),
    };
  },
);

/** 保存草稿：整体校验（引用剧本必须存在）后持久化，返回完整列表 */
export const savePlan = createAsyncThunk(
  "plans/save",
  async (_, { getState }) => {
    const { plans, scenarios } = getState() as PlansRoot;
    const draft = plans.draft;
    if (!draft) {
      throw new Error("没有可保存的编排草稿。");
    }
    validatePlan(draft, scenarios.items);
    const saved = pinPlanScenarios(draft, scenarios.items);
    return {
      items: await savePlanApi(saved),
      draft: saved,
      source: JSON.stringify(draft),
    };
  },
);

/** 另存为：当前草稿以新 id 复制保存，草稿切换为新副本 */
export const savePlanAs = createAsyncThunk(
  "plans/saveAs",
  async (name: string | undefined, { getState }) => {
    const { plans, scenarios } = getState() as PlansRoot;
    const draft = plans.draft;
    if (!draft) {
      throw new Error("没有可保存的编排草稿。");
    }
    validatePlan(draft, scenarios.items);
    const copy: Plan = {
      ...pinPlanScenarios(draft, scenarios.items),
      id: newPlanId(),
      name: name?.trim() || `${draft.name} · 副本`,
    };
    const items = await savePlanApi(copy);
    return { items, draft: copy, source: JSON.stringify(draft) };
  },
);

function pinPlanScenarios(draft: Plan, scenarios: Scenario[]): Plan {
  return {
    ...draft,
    items: draft.items.map((item) => {
      // 已钉快照保持（快照优先，运行时钟同样优先用它）。
      if (item.snapshot) return item;
      const scenario = resolveLaneScenario(item, scenarios);
      // 编辑时钟（钉快照门）问 interpreter（events 域唯一分岔点）：库内命中
      // 即钉，缺失留 undefined（保存由 validatePlan 拦；运行时钟同样拒绝；
      // 文案不动）。后半为类型收窄，语义以解释为准。
      if (
        interpretPresence(scenario !== undefined, "edit").blocks ||
        !scenario
      ) {
        return { ...item, snapshot: undefined };
      }
      return { ...item, snapshot: scenario };
    }),
  };
}

export const deletePlan = createAsyncThunk(
  "plans/delete",
  async (planId: string) => deletePlanApi(planId),
);

/** 切换收藏星标（素材库行内直接持久化） */
export const togglePlanFavorite = createAsyncThunk(
  "plans/toggleFavorite",
  async (planId: string, { getState }) => {
    const { plans } = getState() as PlansRoot;
    const item = plans.items.find((plan) => plan.id === planId);
    if (!item) {
      throw new Error(`编排不存在：${planId}。`);
    }
    return savePlanApi({ ...item, favorite: !item.favorite });
  },
);
