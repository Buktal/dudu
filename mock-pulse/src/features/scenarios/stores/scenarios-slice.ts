import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { isEqual } from "lodash-es";
import type { ChannelId } from "@/lib/channels";
import { draftDirty } from "@/lib/draft-dirty";
import { draftUnchangedSince } from "@/lib/draft-snapshot";

import {
  changeChannel,
  createScenario,
  moveStep,
  removeStep,
  type Scenario,
  scenariosReferencingEvent,
} from "../model";
import type { ScenarioFilters } from "../selectors";
import {
  addScenarioStep,
  addScenarioTemplateStep,
  deleteScenario,
  draftFromScenario,
  fetchScenarios,
  replaceScenarioStep,
  replaceScenarioTemplateStep,
  saveScenario,
  saveScenarioAs,
  syncAllScenarioSteps,
  syncScenarioStep,
} from "./scenarios-thunks";

// 异步编排拆到 scenarios-thunks（按职责拆分，单文件 ≤500 行）；
// 这里转发导出，store 模块对外保持单一入口
export {
  addScenarioStep,
  addScenarioTemplateStep,
  deleteScenario,
  fetchScenarios,
  replaceScenarioStep,
  replaceScenarioTemplateStep,
  saveScenario,
  saveScenarioAs,
  syncAllScenarioSteps,
  syncScenarioStep,
} from "./scenarios-thunks";

export type ScenariosState = {
  /** 已保存的剧本库（渠道由持久层文件路径承载） */
  items: Scenario[];
  loaded: boolean;
  selectedId: string | null;
  /** 编辑中的剧本草稿；无则为空态 */
  draft: Scenario | null;
  /**
   * 草稿自打开 / 新建 / 保存后是否被编辑过（脏判定的 touched 门，
   * 算法单点 lib/draft-dirty）：派生比较判不了「人动手没」。
   */
  touched: boolean;
  filters: ScenarioFilters;
  page: number;
};

export const initialScenariosState: ScenariosState = {
  items: [],
  loaded: false,
  selectedId: null,
  draft: null,
  touched: false,
  filters: { query: "", channel: "all" },
  page: 1,
};

/** 脏判定的内容规范形：id/revision 出列（保存回包才更新），旧文件缺省的
 *  favorite/failure 补齐（与既有逐字段比对同口径），steps 深比较。 */
function comparableScenario(scenario: Scenario) {
  return {
    name: scenario.name,
    channelId: scenario.channelId,
    favorite: !!scenario.favorite,
    failure: scenario.failure ?? "stop",
    steps: scenario.steps,
  };
}

/** 草稿与库内基线的内容差（draftDirty 的 differs 半边）。 */
function scenarioDiffers(draft: Scenario, baseline: Scenario): boolean {
  return !isEqual(comparableScenario(baseline), comparableScenario(draft));
}

/** 基线查找单点：草稿同 id 的库内剧本（未保存过的新草稿为 null）。 */
function savedOf(state: ScenariosState): Scenario | null {
  return state.draft
    ? (state.items.find((item) => item.id === state.draft?.id) ?? null)
    : null;
}

const scenariosSlice = createSlice({
  name: "scenarios",
  initialState: initialScenariosState,
  reducers: {
    /** 新建剧本：先选渠道，步骤为空；添加第一步后渠道锁定 */
    startScenarioDraft(
      state,
      action: PayloadAction<{ name: string; channelId: ChannelId }>,
    ) {
      state.draft = createScenario(
        action.payload.name,
        action.payload.channelId,
      );
      state.selectedId = null;
      state.touched = false;
    },
    /** 打开剧本库中的剧本为草稿副本 */
    openScenario(state, action: PayloadAction<string>) {
      const item = state.items.find((entry) => entry.id === action.payload);
      if (!item) return;
      state.selectedId = item.id;
      state.draft = draftFromScenario(item);
      state.touched = false;
    },
    /** 放弃草稿：已保存的回副本，未保存的回空态 */
    discardScenarioDraft(state) {
      if (!state.draft) return;
      const item = state.items.find((entry) => entry.id === state.draft?.id);
      state.draft = item ? draftFromScenario(item) : null;
      state.touched = false;
    },
    setDraftName(state, action: PayloadAction<string>) {
      if (!state.draft) return;
      state.touched = true;
      state.draft.name = action.payload;
    },
    toggleScenarioFavorite(state) {
      if (state.draft) {
        state.touched = true;
        state.draft.favorite = !state.draft.favorite;
      }
    },
    setScenarioFailure(state, action: PayloadAction<"stop" | "continue">) {
      if (state.draft) {
        state.touched = true;
        state.draft.failure = action.payload;
      }
    },
    setStepWait(state, action: PayloadAction<{ index: number; wait: number }>) {
      const step = state.draft?.steps[action.payload.index];
      if (step && Number.isFinite(action.payload.wait)) {
        state.touched = true;
        step.wait = Math.min(60, Math.max(0, action.payload.wait));
      }
    },
    /** 换渠道：仅无步骤时允许（领域层拒绝带步骤的换渠道） */
    setDraftChannel(state, action: PayloadAction<ChannelId>) {
      if (!state.draft) return;
      state.touched = true;
      state.draft = changeChannel(state.draft, action.payload);
    },
    /** 上移 / 下移：越界为无操作（不动 touched——无操作不算动手） */
    moveDraftStep(
      state,
      action: PayloadAction<{ index: number; delta: -1 | 1 }>,
    ) {
      if (!state.draft) return;
      const moved = moveStep(
        state.draft,
        action.payload.index,
        action.payload.delta,
      );
      if (moved === state.draft) return;
      state.draft = moved;
      state.touched = true;
    },
    /** 按位置删除步骤（越界无操作，不动 touched） */
    removeDraftStep(state, action: PayloadAction<number>) {
      if (!state.draft) return;
      const rest = removeStep(state.draft, action.payload);
      if (rest === state.draft) return;
      state.draft = rest;
      state.touched = true;
    },
    setFilters(state, action: PayloadAction<Partial<ScenarioFilters>>) {
      state.filters = { ...state.filters, ...action.payload };
      state.page = 1;
    },
    setPage(state, action: PayloadAction<number>) {
      state.page = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchScenarios.fulfilled, (state, action) => {
        state.items = action.payload;
        state.loaded = true;
      })
      .addCase(addScenarioStep.fulfilled, (state, action) => {
        state.draft = action.payload;
        state.touched = true;
      })
      .addCase(addScenarioTemplateStep.fulfilled, (state, action) => {
        state.draft = action.payload;
        state.touched = true;
      })
      .addCase(replaceScenarioStep.fulfilled, (state, action) => {
        if (state.draft?.id === action.payload.id) {
          state.draft = action.payload;
          state.touched = true;
        }
      })
      .addCase(replaceScenarioTemplateStep.fulfilled, (state, action) => {
        if (state.draft?.id === action.payload.id) {
          state.draft = action.payload;
          state.touched = true;
        }
      })
      .addCase(syncScenarioStep.fulfilled, (state, action) => {
        state.draft = action.payload;
        state.touched = true;
      })
      .addCase(syncAllScenarioSteps.fulfilled, (state, action) => {
        state.draft = action.payload;
        state.touched = true;
      })
      .addCase(saveScenario.fulfilled, (state, action) => {
        state.items = action.payload;
        const saved = action.payload.find(
          (item) => item.id === state.draft?.id,
        );
        if (saved && state.draft) {
          state.selectedId = saved.id;
          state.draft.revision = saved.revision;
        }
        // 回包只清「保存瞬间」的脏：保存途中又动手的，脏保留（events 域同例）
        state.touched = draftDirty({
          touched: true,
          draft: state.draft,
          baseline: saved ?? null,
          differs: scenarioDiffers,
        });
      })
      .addCase(saveScenarioAs.fulfilled, (state, action) => {
        state.items = action.payload.items;
        if (!draftUnchangedSince(state.draft, action.payload.source)) return;
        state.draft = action.payload.copy;
        state.selectedId = action.payload.copy.id;
        state.touched = false;
      })
      .addCase(deleteScenario.fulfilled, (state, action) => {
        state.items = action.payload;
        if (state.draft?.id === action.meta.arg) {
          state.draft = null;
          state.selectedId = null;
        }
      });
  },
});

export const {
  discardScenarioDraft,
  moveDraftStep,
  openScenario,
  removeDraftStep,
  setDraftChannel,
  setDraftName,
  setFilters,
  setPage,
  startScenarioDraft,
  toggleScenarioFavorite,
  setScenarioFailure,
  setStepWait,
} = scenariosSlice.actions;

export const scenariosReducer = scenariosSlice.reducer;

export function selectScenarioDirty(state: ScenariosState): boolean {
  // 脏判定单点 lib/draft-dirty：touched 门 + 与基线的内容差
  // （新建零编辑不脏——派生比较判不了「人动手没」）
  return draftDirty({
    touched: state.touched,
    draft: state.draft,
    baseline: savedOf(state),
    differs: scenarioDiffers,
  });
}

export function selectScenarios(state: ScenariosState): Scenario[] {
  return state.items;
}

export function selectScenarioDraft(state: ScenariosState): Scenario | null {
  return state.draft;
}

export function selectScenarioFilters(state: ScenariosState): ScenarioFilters {
  return state.filters;
}

export function selectScenarioPage(state: ScenariosState): number {
  return state.page;
}

export function selectSelectedScenarioId(state: ScenariosState): string | null {
  return state.selectedId;
}

export function selectLoaded(state: ScenariosState): boolean {
  return state.loaded;
}

/** 跨 feature 窄 selector：引用该事件的剧本名列表（空 = 可删除，UI 据此禁删）。
 *  入参收 RootState 形状（含 scenarios 键即可），避免外部直读 items 形状。 */
export function scenarioNamesReferencingEvent(
  state: ScenariosState | { scenarios: ScenariosState },
  eventId: string,
): string[] {
  const scenarios = "scenarios" in state ? state.scenarios : state;
  return scenariosReferencingEvent(eventId, scenarios.items).map(
    (scenario) => scenario.name,
  );
}
