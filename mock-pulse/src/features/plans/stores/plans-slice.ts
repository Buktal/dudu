import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import type { ConnectionConfig } from "@/features/connections";
import { isConnectionReady } from "@/features/connections";
import type { RunProgressPayload, RunStep } from "@/features/runs";
import type { Scenario } from "@/features/scenarios";
import type { ChannelId } from "@/lib/channels";
import type { RootState } from "@/store";

import {
  deletePlanById as deletePlanApi,
  loadPlans,
  savePlan as savePlanApi,
  startPlanRun as startPlanRunApi,
} from "../api";
import { materializePlanRun, type PlanRunSnapshot } from "../materialize";
import {
  addLane,
  createPlan,
  moveLane,
  newPlanId,
  type Plan,
  type PlanFailure,
  type PlanMode,
  plansReferencingScenario,
  removeLane,
  validatePlan,
  withPlanFailure,
  withPlanMode,
} from "../model";
import type { PlanFilters } from "../selectors";

/**
 * 执行编排域状态：持久化列表 + 编辑草稿 + 活跃编排运行实况。
 * 运行实况监听与 runs 相同的 run-progress 事件（组合根各 dispatch 一份），
 * 按 runId 过滤、按 lane 路由到对应剧本的步骤状态。
 */

/** 编排运行阶段（运行按钮与进行中实况消费，同剧本运行语义） */
export type PlanRunPhase =
  | "idle"
  | "starting"
  | "running"
  | "needConnection"
  | "error";

/** 进行中编排的步骤状态（复用 runs 的状态词汇） */
export type LivePlanStepStatus =
  | "pending"
  | "waiting"
  | "success"
  | "failed"
  | "skipped";

/** 进行中编排的一个步骤：完成前只有事件名与状态，完成后携带快照 */
export type LivePlanStep = {
  eventName: string;
  status: LivePlanStepStatus;
  step?: RunStep;
};

/** 进行中编排的一条 lane（= 一个剧本） */
export type LivePlanLane = {
  scenarioName: string;
  channel?: ChannelId;
  steps: LivePlanStep[];
};

/** 进行中的编排运行（Rust 执行器经 run-progress 事件实时回报，带 lane） */
export type LivePlanRun = {
  runId: string;
  sourceId?: string;
  planName: string;
  mode: PlanMode;
  failure: PlanFailure;
  startedAt: string;
  lanes: LivePlanLane[];
};

export type PlansState = {
  /** 已保存的编排库 */
  items: Plan[];
  loaded: boolean;
  selectedId: string | null;
  /** 编辑中的编排草稿；无则为空态 */
  draft: Plan | null;
  filters: PlanFilters;
  page: number;
  /** 进行中的编排运行（无则空） */
  live: LivePlanRun | null;
  /** 编排运行阶段 */
  planRunPhase: PlanRunPhase;
  /** planRunPhase = error 时的人类可读原因 */
  planRunMessage: string;
  /** planRunPhase = needConnection 时缺失连接的渠道 */
  needConnectionChannels: ChannelId[];
};

export const initialPlansState: PlansState = {
  items: [],
  loaded: false,
  selectedId: null,
  draft: null,
  filters: { query: "", kind: "all" },
  page: 1,
  live: null,
  planRunPhase: "idle",
  planRunMessage: "",
  needConnectionChannels: [],
};

/** 保存/编辑链路需要读取剧本库与连接配置（RootState 局部形状，避免全量耦合） */
type PlansRoot = {
  plans: PlansState;
  scenarios: { items: Scenario[] };
  connections: { items: Record<string, ConnectionConfig> };
};

/** 装载已保存编排为独立草稿副本（编辑不影响库内对象）。 */
function draftFromPlan(item: Plan): Plan {
  return {
    ...item,
    items: item.items.map((lane) => ({ ...lane })),
  };
}

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
    const scenario = scenarios.items.find(
      (entry) => entry.id === item?.scenarioId,
    );
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
    items: draft.items.map((item) =>
      item.snapshot
        ? item
        : {
            ...item,
            snapshot: scenarios.find(
              (scenario) => scenario.id === item.scenarioId,
            ),
          },
    ),
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

/** 编排运行结果：正常返回 noop/needConnection 分支或 started（异常走 rejected） */
type PlanRunResult =
  | { kind: "noop" }
  | { kind: "needConnection"; channels: ChannelId[] }
  | { kind: "started"; live: LivePlanRun };

/** 快照 → 进行中编排运行（每 lane 每步 pending） */
function liveFromSnapshot(snapshot: PlanRunSnapshot): LivePlanRun {
  return {
    runId: snapshot.runId,
    sourceId: snapshot.planId,
    planName: snapshot.planName,
    mode: snapshot.mode,
    failure: snapshot.failure,
    startedAt: snapshot.startedAt,
    lanes: snapshot.scenarios.map((scenario) => ({
      scenarioName: scenario.scenarioName,
      channel: scenario.steps[0]?.channel,
      steps: scenario.steps.map((step) => ({
        eventName: step.eventName,
        status: "pending" as const,
      })),
    })),
  };
}

/** 启动编排运行（当前选中的编排草稿）：
 *  校验引用 → 每个 lane 涉及的渠道连接就绪检查 → 物化快照（启动时固化）
 *  → invoke Rust 执行器 → 命令立即返回 run id，进度由 run-progress 驱动。 */
export const startPlanRun = createAsyncThunk<
  PlanRunResult,
  void,
  { state: RootState }
>(
  "plans/start",
  async (_, { getState, dispatch }) => {
    const state = getState();
    const plan = state.plans.draft;
    if (!plan) {
      return { kind: "noop" as const };
    }
    validatePlan(plan, state.scenarios.items);
    const laneScenarios = plan.items.map((item) => {
      const scenario =
        item.snapshot ??
        state.scenarios.items.find(
          (candidate) => candidate.id === item.scenarioId,
        );
      if (!scenario) {
        throw new Error(`编排引用的剧本不存在：${item.scenarioId}。`);
      }
      return scenario;
    });
    // 连接就绪检查：去重后的渠道逐一确认（未配置给「前往平台连接」指引）
    const channels = [
      ...new Set(laneScenarios.map((scenario) => scenario.channelId)),
    ];
    const missing = channels.filter((channel) => {
      const connection = state.connections.items[channel];
      return !isConnectionReady(connection);
    });
    if (missing.length > 0) {
      return { kind: "needConnection" as const, channels: missing };
    }
    const snapshot = materializePlanRun({
      plan,
      scenarios: state.scenarios.items,
      events: state.events.items,
      startedAt: new Date().toISOString(),
    });
    const connections = channels.map(
      (channel) => state.connections.items[channel],
    );
    // 命令立即返回（run id 即 snapshot.runId）；进度由 run-progress 事件驱动
    const live = liveFromSnapshot(snapshot);
    dispatch(planStarted(live));
    await startPlanRunApi(snapshot, connections);
    return { kind: "started" as const, live };
  },
  {
    condition: (_, { getState }) => {
      const { runs, plans } = getState();
      return (
        runs.phase !== "sending" &&
        !["starting", "running"].includes(runs.scenarioRunPhase) &&
        !["starting", "running"].includes(plans.planRunPhase)
      );
    },
  },
);

const plansSlice = createSlice({
  name: "plans",
  initialState: initialPlansState,
  reducers: {
    planStarted(state, action: PayloadAction<LivePlanRun>) {
      state.live = action.payload;
      state.planRunPhase = "running";
      state.needConnectionChannels = [];
    },
    /** 新建编排草稿：名称 + 执行方式，lanes 为空 */
    startPlanDraft(
      state,
      action: PayloadAction<{ name: string; mode: PlanMode }>,
    ) {
      state.draft = createPlan(action.payload.name, action.payload.mode);
      state.selectedId = null;
    },
    /** 打开编排库中的编排为草稿副本 */
    openPlan(state, action: PayloadAction<string>) {
      const item = state.items.find((entry) => entry.id === action.payload);
      if (!item) return;
      state.selectedId = item.id;
      state.draft = draftFromPlan(item);
    },
    /** 放弃草稿：已保存的回副本，未保存的回空态 */
    discardPlanDraft(state) {
      if (!state.draft) return;
      const item = state.items.find((entry) => entry.id === state.draft?.id);
      state.draft = item ? draftFromPlan(item) : null;
    },
    setPlanDraftName(state, action: PayloadAction<string>) {
      if (!state.draft) return;
      state.draft.name = action.payload;
    },
    toggleDraftFavorite(state) {
      if (state.draft) state.draft.favorite = !state.draft.favorite;
    },
    setPlanDraftMode(state, action: PayloadAction<PlanMode>) {
      if (!state.draft) return;
      state.draft = withPlanMode(state.draft, action.payload);
    },
    setPlanDraftFailure(state, action: PayloadAction<PlanFailure>) {
      if (!state.draft) return;
      state.draft = withPlanFailure(state.draft, action.payload);
    },
    /** 上移 / 下移 lane：越界为无操作 */
    moveDraftLane(
      state,
      action: PayloadAction<{ index: number; delta: -1 | 1 }>,
    ) {
      if (!state.draft) return;
      state.draft = moveLane(
        state.draft,
        action.payload.index,
        action.payload.delta,
      );
    },
    /** 按位置删除 lane */
    removeDraftLane(state, action: PayloadAction<number>) {
      if (!state.draft) return;
      state.draft = removeLane(state.draft, action.payload);
    },
    setFilters(state, action: PayloadAction<Partial<PlanFilters>>) {
      state.filters = { ...state.filters, ...action.payload };
      state.page = 1;
    },
    setPage(state, action: PayloadAction<number>) {
      state.page = action.payload;
    },
    /** run-progress 事件驱动：按 runId 过滤、按 lane 路由步骤状态；
     *  finished 收束实况与运行阶段（完整记录由 runs 域入列历史）。 */
    onPlanProgress(state, action: PayloadAction<RunProgressPayload>) {
      const { runId, index, status, step, lane } = action.payload;
      if (status === "finished") {
        if (state.live?.runId !== runId) return;
        state.live = null;
        if (state.planRunPhase === "running") {
          state.planRunPhase = "idle";
        }
        return;
      }
      const live = state.live;
      if (!live || live.runId !== runId || lane === undefined) return;
      const targetStep = live.lanes[lane]?.steps[index];
      if (!targetStep) return;
      if (status === "waiting" || status === "skipped") {
        targetStep.status = status;
        return;
      }
      targetStep.status = status;
      if (step) {
        targetStep.step = step;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPlans.fulfilled, (state, action) => {
        state.items = action.payload;
        state.loaded = true;
      })
      .addCase(addPlanLane.fulfilled, (state, action) => {
        state.draft = action.payload;
      })
      .addCase(syncPlanLane.fulfilled, (state, action) => {
        if (state.draft?.id === action.payload.id) state.draft = action.payload;
      })
      .addCase(savePlan.fulfilled, (state, action) => {
        state.items = action.payload.items;
        if (JSON.stringify(state.draft) !== action.payload.source) return;
        state.draft = draftFromPlan(action.payload.draft);
        state.selectedId = action.payload.draft.id;
      })
      .addCase(savePlanAs.fulfilled, (state, action) => {
        state.items = action.payload.items;
        if (JSON.stringify(state.draft) !== action.payload.source) return;
        state.draft = action.payload.draft;
        state.selectedId = action.payload.draft.id;
      })
      .addCase(deletePlan.fulfilled, (state, action) => {
        state.items = action.payload;
        if (state.draft?.id === action.meta.arg) {
          state.draft = null;
          state.selectedId = null;
        }
      })
      .addCase(togglePlanFavorite.fulfilled, (state, action) => {
        state.items = action.payload;
        // 草稿同源时同步收藏态（星标在素材库切换，编辑器随之一致）
        const saved = action.payload.find(
          (item) => item.id === state.draft?.id,
        );
        if (saved && state.draft) {
          state.draft.favorite = saved.favorite;
        }
      })
      .addCase(startPlanRun.pending, (state) => {
        state.planRunPhase = "starting";
        state.planRunMessage = "";
      })
      .addCase(startPlanRun.fulfilled, (state, action) => {
        if (action.payload.kind === "noop") {
          state.planRunPhase = "idle";
          return;
        }
        if (action.payload.kind === "needConnection") {
          state.planRunPhase = "needConnection";
          state.needConnectionChannels = action.payload.channels;
          return;
        }
        if (state.live?.runId === action.payload.live.runId)
          state.planRunPhase = "running";
      })
      .addCase(startPlanRun.rejected, (state, action) => {
        if (action.meta.condition) return;
        state.live = null;
        state.planRunPhase = "error";
        state.planRunMessage = action.error.message ?? "启动编排运行失败";
      });
  },
});

export const {
  discardPlanDraft,
  moveDraftLane,
  onPlanProgress,
  planStarted,
  openPlan,
  removeDraftLane,
  setFilters,
  setPage,
  setPlanDraftFailure,
  setPlanDraftMode,
  setPlanDraftName,
  startPlanDraft,
  toggleDraftFavorite,
} = plansSlice.actions;

export const plansReducer = plansSlice.reducer;

export function selectPlanDirty(state: PlansState): boolean {
  if (!state.draft) return false;
  const saved = state.items.find((item) => item.id === state.draft?.id);
  return (
    !saved ||
    saved.name !== state.draft.name ||
    saved.mode !== state.draft.mode ||
    saved.failure !== state.draft.failure ||
    saved.favorite !== state.draft.favorite ||
    JSON.stringify(saved.items) !== JSON.stringify(state.draft.items)
  );
}

export function selectPlans(state: PlansState): Plan[] {
  return state.items;
}

export function selectPlanDraft(state: PlansState): Plan | null {
  return state.draft;
}

export function selectPlanFilters(state: PlansState): PlanFilters {
  return state.filters;
}

export function selectPlanPage(state: PlansState): number {
  return state.page;
}

export function selectLoaded(state: PlansState): boolean {
  return state.loaded;
}

export function selectLivePlanRun(state: PlansState): LivePlanRun | null {
  return state.live;
}

export function selectPlanRunPhase(state: PlansState): PlanRunPhase {
  return state.planRunPhase;
}

export function selectPlanRunMessage(state: PlansState): string {
  return state.planRunMessage;
}

/** 跨 feature 窄 selector：引用该剧本的编排名列表（空 = 可删除，
 *  组合根删除守卫消费）。入参收 RootState 形状（含 plans 键即可）。 */
export function planNamesReferencingScenario(
  state: PlansState | { plans: PlansState },
  scenarioId: string,
): string[] {
  const plans = "plans" in state ? state.plans : state;
  return plansReferencingScenario(scenarioId, plans.items).map(
    (plan) => plan.name,
  );
}

/** 即使来源剧本已经改动，编排的固定快照仍持有事件版本。 */
export function planNamesReferencingEvent(
  state: PlansState,
  eventId: string,
): string[] {
  return state.items
    .filter((plan) =>
      plan.items.some((lane) =>
        lane.snapshot?.steps.some((step) => step.eventId === eventId),
      ),
    )
    .map((plan) => plan.name);
}
