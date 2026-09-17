import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { isEqual } from "lodash-es";

import {
  foldProjectedOutcome,
  liveStarted,
  type PlanPhaseLike,
  type RunPhase,
  runProgress,
} from "@/features/runs";
import type { ChannelId } from "@/lib/channels";

import {
  createPlan,
  moveLane,
  type Plan,
  type PlanFailure,
  type PlanMode,
  removeLane,
  withPlanFailure,
  withPlanMode,
} from "../model";
import type { PlanFilters } from "../selectors";
import {
  addPlanLane,
  deletePlan,
  fetchPlans,
  savePlan,
  savePlanAs,
  syncPlanLane,
  togglePlanFavorite,
} from "./plan-library";
import { startPlanRun } from "./plan-run";

/**
 * 执行编排域状态：持久化列表 + 编辑草稿 + 编排运行阶段簿记。
 * 库链路 thunk 与运行 thunk 分别见 plan-library / plan-run（按职责拆分）。
 * 运行实况投影在 runs 域（组合根只 dispatch 一次 runProgress）：本域监听
 * 同一组 action 只做编排运行的阶段簿记（activeRunId → phase），实况展示
 * 经 runs 的 selectLiveRunFor 从 runs 域派生，不复制实况状态。
 */

/** 编排运行阶段（RunPhase 的编排别名，同剧本运行语义） */
export type PlanRunPhase = RunPhase;

export type PlansState = {
  /** 已保存的编排库 */
  items: Plan[];
  loaded: boolean;
  selectedId: string | null;
  /** 编辑中的编排草稿；无则为空态 */
  draft: Plan | null;
  filters: PlanFilters;
  page: number;
  /** 编排运行阶段 */
  planRunPhase: PlanRunPhase;
  /** planRunPhase = error 时的人类可读原因 */
  planRunMessage: string;
  /** planRunPhase = needConnection 时缺失连接的渠道 */
  needConnectionChannels: ChannelId[];
  /** 进行中编排运行的 run id（实况本体在 runs 域，这里只做阶段簿记） */
  activeRunId: string | null;
};

export const initialPlansState: PlansState = {
  items: [],
  loaded: false,
  selectedId: null,
  draft: null,
  filters: { query: "", kind: "all" },
  page: 1,
  planRunPhase: "idle",
  planRunMessage: "",
  needConnectionChannels: [],
  activeRunId: null,
};

// 编译期契约：PlansState 满足 runs 会话所需的最小形状（单点见 plan-adapter.ts）。
type _PlansConformsToSession = PlansState extends PlanPhaseLike ? true : never;
const _plansConformsToSession: _PlansConformsToSession = true;
void _plansConformsToSession;

/** 装载已保存编排为独立草稿副本（编辑不影响库内对象）。 */
function draftFromPlan(item: Plan): Plan {
  return {
    ...item,
    items: item.items.map((lane) => ({ ...lane })),
  };
}

const plansSlice = createSlice({
  name: "plans",
  initialState: initialPlansState,
  reducers: {
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
  },
  extraReducers: (builder) => {
    builder
      // runs 域投影了编排运行实况：本域只记 run id 并进入 running 阶段
      .addCase(liveStarted, (state, action) => {
        if (action.payload.kind !== "plan") return;
        state.activeRunId = action.payload.runId;
        state.planRunPhase = "running";
        state.needConnectionChannels = [];
      })
      // finished 收束阶段；历史入列与实况收敛都在 runs 域
      .addCase(runProgress, (state, action) => {
        const { runId, status } = action.payload;
        if (status !== "finished" || state.activeRunId !== runId) return;
        state.activeRunId = null;
        if (state.planRunPhase === "running") state.planRunPhase = "idle";
      })
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
        // 投影 outcome 折叠单点见 runs 域 launch.ts foldProjectedOutcome（含
        // shouldConfirmRunning 守卫：完成事件早于命令返回时不复活运行）
        const folded = foldProjectedOutcome(
          action.payload,
          state.activeRunId,
          state.planRunPhase,
        );
        state.planRunPhase = folded.phase;
        if (folded.channels !== undefined)
          state.needConnectionChannels = folded.channels;
      })
      .addCase(startPlanRun.rejected, (state, action) => {
        if (action.meta.condition) return;
        state.activeRunId = null;
        state.planRunPhase = "error";
        state.planRunMessage = action.error.message ?? "启动编排运行失败";
      });
  },
});

export const {
  discardPlanDraft,
  moveDraftLane,
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
    !isEqual(saved.items, state.draft.items)
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

export function selectPlanRunPhase(state: PlansState): PlanRunPhase {
  return state.planRunPhase;
}

export function selectPlanRunMessage(state: PlansState): string {
  return state.planRunMessage;
}
