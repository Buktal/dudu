import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";
import type { EventItem, EventsState, EventVersion } from "@/features/events";
import type { ChannelId } from "@/lib/channels";

import {
  deleteScenarioById as deleteScenarioApi,
  loadScenarios,
  saveScenario as saveScenarioApi,
} from "../api";
import {
  addStep,
  assertSameChannel,
  changeChannel,
  createScenario,
  moveStep,
  newScenarioId,
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

export const replaceScenarioStep = createAsyncThunk(
  "scenarios/replaceStep",
  async (
    { index, eventId }: { index: number; eventId: string },
    { getState },
  ) => {
    const { scenarios, events } = getState() as ScenariosRoot;
    const draft = scenarios.draft;
    if (!draft?.steps[index]) throw new Error("找不到要替换的步骤。");
    const { event, version } = latestVersionOf(events.items, eventId);
    assertSameChannel(draft.channelId, event.channelId);
    return {
      ...draft,
      steps: draft.steps.map((step, i) =>
        i === index ? { ...step, eventId, revision: version.revision } : step,
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
    validateScenario(copy, events.items);
    return {
      items: await saveScenarioApi(copy),
      copy,
      source: JSON.stringify(scenarios.draft),
    };
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
    const previous = scenarios.items.find((item) => item.id === draft.id);
    return saveScenarioApi({
      ...draft,
      revision: (previous?.revision ?? (previous ? 1 : 0)) + 1,
    });
  },
);

export const deleteScenario = createAsyncThunk(
  "scenarios/delete",
  async (scenarioId: string) => deleteScenarioApi(scenarioId),
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
    toggleScenarioFavorite(state) {
      if (state.draft) state.draft.favorite = !state.draft.favorite;
    },
    setScenarioFailure(state, action: PayloadAction<"stop" | "continue">) {
      if (state.draft) state.draft.failure = action.payload;
    },
    setStepWait(state, action: PayloadAction<{ index: number; wait: number }>) {
      const step = state.draft?.steps[action.payload.index];
      if (step && Number.isFinite(action.payload.wait))
        step.wait = Math.min(60, Math.max(0, action.payload.wait));
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
      .addCase(replaceScenarioStep.fulfilled, (state, action) => {
        if (state.draft?.id === action.payload.id) state.draft = action.payload;
      })
      .addCase(syncScenarioStep.fulfilled, (state, action) => {
        state.draft = action.payload;
      })
      .addCase(syncAllScenarioSteps.fulfilled, (state, action) => {
        state.draft = action.payload;
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
      })
      .addCase(saveScenarioAs.fulfilled, (state, action) => {
        state.items = action.payload.items;
        if (JSON.stringify(state.draft) !== action.payload.source) return;
        state.draft = action.payload.copy;
        state.selectedId = action.payload.copy.id;
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
  if (!state.draft) return false;
  const saved = state.items.find((item) => item.id === state.draft?.id);
  return (
    !saved ||
    saved.name !== state.draft.name ||
    saved.channelId !== state.draft.channelId ||
    !!saved.favorite !== !!state.draft.favorite ||
    (saved.failure ?? "stop") !== (state.draft.failure ?? "stop") ||
    JSON.stringify(saved.steps) !== JSON.stringify(state.draft.steps)
  );
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
