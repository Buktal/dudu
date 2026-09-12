import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import {
  deleteEvent,
  type EventItem,
  type EventsState,
  type EventVersion,
} from "@/features/events";
import type { ChannelId } from "@/lib/channels";

import {
  deleteScenarioById as deleteScenarioApi,
  loadScenarios,
  saveScenario as saveScenarioApi,
} from "../api";
import {
  addStep,
  changeChannel,
  createScenario,
  moveStep,
  removeStep,
  type Scenario,
  scenariosReferencingEvent,
  validateScenario,
  withStepRevision,
} from "../model";
import type { ScenarioFilters } from "../selectors";

export type ScenariosState = {
  /** 已保存的剧本库（渠道由持久层文件路径承载） */
  items: Scenario[];
  loaded: boolean;
  selectedId: string | null;
  /** 编辑中的剧本草稿；无则为空态 */
  draft: Scenario | null;
  filters: ScenarioFilters;
  page: number;
};

export const initialScenariosState: ScenariosState = {
  items: [],
  loaded: false,
  selectedId: null,
  draft: null,
  filters: { query: "", channel: "all" },
  page: 1,
};

type ScenariosRoot = { scenarios: ScenariosState; events: EventsState };

/**
 * 素材库查事件并取其最新版本（添加步骤 / 同步引用共用）：
 * 事件不存在或从未保存过版本时抛可读错误。
 */
function latestVersionOf(
  events: EventsState["items"],
  eventId: string,
): { event: EventItem; version: EventVersion } {
  const event = events.find((item) => item.id === eventId);
  if (!event) {
    throw new Error(`事件不存在：${eventId}。`);
  }
  const version = event.versions[event.versions.length - 1];
  if (!version) {
    throw new Error(`事件还没有保存过版本：${event.name}。`);
  }
  return { event, version };
}

/** 装载已保存剧本为独立草稿副本（编辑不影响库内对象）。 */
function draftFromScenario(item: Scenario): Scenario {
  return { ...item, steps: item.steps.map((step) => ({ ...step })) };
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
    const { event, version } = latestVersionOf(events.items, eventId);
    return addStep(draft, {
      id: event.id,
      channelId: event.channelId,
      revision: version.revision,
    });
  },
);

/** 显式同步单个步骤的引用到事件最新版本。 */
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
    const { version } = latestVersionOf(events.items, step.eventId);
    return withStepRevision(draft, index, version.revision);
  },
);

/** 整体同步：把所有步骤引用更新到各事件最新版本。 */
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
      const { version } = latestVersionOf(events.items, step.eventId);
      updated = withStepRevision(updated, index, version.revision);
    }
    return updated;
  },
);

/** 保存草稿：整体校验（防绕过 addStep 的走私步骤）后持久化，返回完整列表 */
export const saveScenario = createAsyncThunk(
  "scenarios/save",
  async (_, { getState }) => {
    const { scenarios, events } = getState() as ScenariosRoot;
    const draft = scenarios.draft;
    if (!draft) {
      throw new Error("没有可保存的剧本草稿。");
    }
    validateScenario(draft, events.items);
    return saveScenarioApi(draft);
  },
);

export const deleteScenario = createAsyncThunk(
  "scenarios/delete",
  async (scenarioId: string) => deleteScenarioApi(scenarioId),
);

/**
 * 事件删除守卫：被剧本引用的事件禁止删除（先删/调整剧本），
 * 未引用则转发事件删除流程。归 scenarios 域：引用关系是剧本侧的事实。
 */
export const deleteEventGuarded = createAsyncThunk(
  "scenarios/deleteEventGuarded",
  async (eventId: string, { getState, dispatch }) => {
    const { scenarios } = getState() as ScenariosRoot;
    const referencing = scenariosReferencingEvent(eventId, scenarios.items);
    if (referencing.length > 0) {
      const names = referencing
        .map((scenario) => `「${scenario.name}」`)
        .join("、");
      throw new Error(
        `事件被剧本引用：${names}。先删除或调整剧本，再删除事件。`,
      );
    }
    return dispatch(deleteEvent(eventId)).unwrap();
  },
);

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
    },
    /** 打开剧本库中的剧本为草稿副本 */
    openScenario(state, action: PayloadAction<string>) {
      const item = state.items.find((entry) => entry.id === action.payload);
      if (!item) return;
      state.selectedId = item.id;
      state.draft = draftFromScenario(item);
    },
    /** 放弃草稿：已保存的回副本，未保存的回空态 */
    discardScenarioDraft(state) {
      if (!state.draft) return;
      const item = state.items.find((entry) => entry.id === state.draft?.id);
      state.draft = item ? draftFromScenario(item) : null;
    },
    setDraftName(state, action: PayloadAction<string>) {
      if (!state.draft) return;
      state.draft.name = action.payload;
    },
    /** 换渠道：仅无步骤时允许（领域层拒绝带步骤的换渠道） */
    setDraftChannel(state, action: PayloadAction<ChannelId>) {
      if (!state.draft) return;
      state.draft = changeChannel(state.draft, action.payload);
    },
    /** 上移 / 下移：越界为无操作 */
    moveDraftStep(
      state,
      action: PayloadAction<{ index: number; delta: -1 | 1 }>,
    ) {
      if (!state.draft) return;
      state.draft = moveStep(
        state.draft,
        action.payload.index,
        action.payload.delta,
      );
    },
    /** 按位置删除步骤 */
    removeDraftStep(state, action: PayloadAction<number>) {
      if (!state.draft) return;
      state.draft = removeStep(state.draft, action.payload);
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
      })
      .addCase(syncScenarioStep.fulfilled, (state, action) => {
        state.draft = action.payload;
      })
      .addCase(syncAllScenarioSteps.fulfilled, (state, action) => {
        state.draft = action.payload;
      })
      .addCase(saveScenario.fulfilled, (state, action) => {
        state.items = action.payload;
        state.selectedId = state.draft?.id ?? state.selectedId;
      })
      .addCase(deleteScenario.fulfilled, (state, action) => {
        state.items = action.payload;
        if (
          state.draft &&
          !action.payload.some((item) => item.id === state.draft?.id)
        ) {
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
} = scenariosSlice.actions;

export const scenariosReducer = scenariosSlice.reducer;

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
