import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import type { ChannelId } from "@/lib/channels";

import {
  type DefinitionsDoc,
  deleteEventById as deleteEventApi,
  loadDefinitions,
  loadEvents,
  type StoredSchemaDefinition,
  saveDefinition,
  saveEvent as saveEventApi,
} from "../api";
import {
  appendVersion,
  createDraft,
  draftFromItem,
  duplicateDraft,
  type EventDraft,
  type EventItem,
  type ExpectedReceipt,
} from "../model";
import { editorPayload, setPayloadField, syncSenderIdentity } from "../payload";
import type { FieldDescriptor } from "../schemas";
import { schemaById, type WirePayload } from "../schemas";
import type { EventFilters } from "../selectors";

/** 用户编辑的字段定义（#22）：按 schemaId 覆写随应用分发的渠道描述文件基线 */
export type FieldDefinitionsState = {
  loaded: boolean;
  bySchemaId: Record<string, StoredSchemaDefinition>;
};

export type EventsState = {
  /** 已保存的素材库事件（含全部版本） */
  items: EventItem[];
  loaded: boolean;
  selectedId: string | null;
  /** 编辑器草稿（无则为空态）；payload 为表单形态 */
  draft: EventDraft | null;
  filters: EventFilters;
  page: number;
  /** 字段说明：用户定义覆写（字典「应用说明」落库） */
  definitions: FieldDefinitionsState;
};

export const initialEventsState: EventsState = {
  items: [],
  loaded: false,
  selectedId: null,
  draft: null,
  filters: { query: "", channel: "all", kind: "all" },
  page: 1,
  definitions: { loaded: false, bySchemaId: {} },
};

type EventsRoot = { events: EventsState };

export const fetchEvents = createAsyncThunk("events/fetch", async () =>
  loadEvents(),
);

/** 保存草稿 = 追加不可变版本并持久化（返回完整列表） */
export const saveEvent = createAsyncThunk(
  "events/save",
  async (_, { getState }) => {
    const { events } = getState() as EventsRoot;
    const draft = events.draft;
    if (!draft) {
      throw new Error("没有可保存的草稿。");
    }
    const existing = events.items.find((item) => item.id === draft.id) ?? null;
    const next = appendVersion(existing, draft, new Date().toISOString());
    return saveEventApi(next);
  },
);

/** 事件级重命名：不追加版本 */
export const renameEvent = createAsyncThunk(
  "events/rename",
  async ({ id, name }: { id: string; name: string }, { getState }) => {
    const { events } = getState() as EventsRoot;
    const item = events.items.find((entry) => entry.id === id);
    if (!item) {
      throw new Error(`事件不存在：${id}`);
    }
    return saveEventApi({ ...item, name });
  },
);

export const deleteEvent = createAsyncThunk(
  "events/delete",
  async (id: string) => deleteEventApi(id),
);

/** 装载用户字段定义（启动时随事件视图拉取） */
export const fetchFieldDefinitions = createAsyncThunk(
  "events/fetchDefinitions",
  async () => loadDefinitions(),
);

/** 字典「应用说明」：把生效字段写成该 schemaId 的用户定义并持久化 */
export const applyFieldDefinitions = createAsyncThunk(
  "events/applyDefinitions",
  async ({
    schemaId,
    version,
    fields,
  }: {
    schemaId: string;
    version: string;
    fields: FieldDescriptor[];
  }) => saveDefinition(schemaId, { schemaId, version, fields }),
);

const eventsSlice = createSlice({
  name: "events",
  initialState: initialEventsState,
  reducers: {
    /** 打开素材库中的事件：装载最新版本为草稿 */
    openEvent(state, action: PayloadAction<string>) {
      const item = state.items.find((entry) => entry.id === action.payload);
      if (!item) return;
      state.selectedId = item.id;
      state.draft = draftFromItem(item);
    },
    /** 从内置模板新建草稿（ID 按官方形态生成） */
    startDraft(
      state,
      action: PayloadAction<{ name: string; schemaId: string }>,
    ) {
      state.draft = createDraft(
        action.payload.name,
        schemaById(action.payload.schemaId),
      );
      state.selectedId = null;
    },
    /** 表单修改一个字段；同步开关开启时发送者 ID 跟随资料 ID */
    setDraftField(
      state,
      action: PayloadAction<{ path: string; value: unknown }>,
    ) {
      if (!state.draft) return;
      const schema = schemaById(state.draft.schemaId);
      let payload = setPayloadField(
        state.draft.payload,
        action.payload.path,
        action.payload.value,
      );
      if (state.draft.senderSync && action.payload.path === "from_user_id") {
        payload = syncSenderIdentity(schema, payload);
      }
      state.draft.payload = payload;
    },
    /** 完整报文应用回字段（组件已校验合法性；contentString 解析为表单形态） */
    setDraftPayload(state, action: PayloadAction<WirePayload>) {
      if (!state.draft) return;
      const schema = schemaById(state.draft.schemaId);
      state.draft.payload = editorPayload(schema, action.payload);
    },
    setDraftName(state, action: PayloadAction<string>) {
      if (!state.draft) return;
      state.draft.name = action.payload;
    },
    /** 编辑期望回执（Partial 合并：状态码 / 形态 / 期望正文） */
    setDraftExpected(state, action: PayloadAction<Partial<ExpectedReceipt>>) {
      if (!state.draft) return;
      state.draft.expected = { ...state.draft.expected, ...action.payload };
    },
    /** 发送者 ID 显式同步开关：开启即对齐资料 open_id */
    toggleSenderSync(state) {
      if (!state.draft) return;
      state.draft.senderSync = !state.draft.senderSync;
      if (state.draft.senderSync) {
        state.draft.payload = syncSenderIdentity(
          schemaById(state.draft.schemaId),
          state.draft.payload,
        );
      }
    },
    /** 复制 = 新事件携带当前载荷草稿 */
    duplicateCurrentDraft(state) {
      if (!state.draft) return;
      state.draft = duplicateDraft(state.draft);
      state.selectedId = null;
    },
    discardDraft(state) {
      if (!state.draft) return;
      const item = state.items.find((entry) => entry.id === state.draft?.id);
      state.draft = item ? draftFromItem(item) : null;
    },
    setFilters(state, action: PayloadAction<Partial<EventFilters>>) {
      state.filters = { ...state.filters, ...action.payload };
      state.page = 1;
    },
    setPage(state, action: PayloadAction<number>) {
      state.page = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEvents.fulfilled, (state, action) => {
        state.items = action.payload;
        state.loaded = true;
      })
      .addCase(saveEvent.fulfilled, (state, action) => {
        state.items = action.payload;
        state.selectedId = state.draft?.id ?? state.selectedId;
      })
      .addCase(renameEvent.fulfilled, (state, action) => {
        state.items = action.payload;
        if (state.draft) {
          const renamed = action.payload.find(
            (item) => item.id === state.draft?.id,
          );
          if (renamed) {
            state.draft.name = renamed.name;
          }
        }
      })
      .addCase(deleteEvent.fulfilled, (state, action) => {
        state.items = action.payload;
        if (
          state.draft &&
          !action.payload.some((item) => item.id === state.draft?.id)
        ) {
          state.draft = null;
          state.selectedId = null;
        }
      })
      .addCase(fetchFieldDefinitions.fulfilled, (state, action) => {
        state.definitions = definitionsFromDoc(action.payload);
      })
      .addCase(applyFieldDefinitions.fulfilled, (state, action) => {
        state.definitions = definitionsFromDoc(action.payload);
      });
  },
});

// 注：fetchFieldDefinitions / applyFieldDefinitions 是上方导出的 thunk，
// 不是 slice action creator，不参与此处解构。
export const {
  discardDraft,
  duplicateCurrentDraft,
  openEvent,
  setDraftExpected,
  setDraftField,
  setDraftName,
  setDraftPayload,
  setFilters,
  setPage,
  startDraft,
  toggleSenderSync,
} = eventsSlice.actions;

export const eventsReducer = eventsSlice.reducer;

/** 持久化文档 → slice 内 definitions 状态 */
function definitionsFromDoc(doc: DefinitionsDoc): FieldDefinitionsState {
  return { loaded: true, bySchemaId: doc.schemas };
}

export function selectEvents(state: EventsState): EventItem[] {
  return state.items;
}

export function selectDraft(state: EventsState): EventDraft | null {
  return state.draft;
}

export function selectFilters(state: EventsState): EventFilters {
  return state.filters;
}

export function selectPage(state: EventsState): number {
  return state.page;
}

export function selectSelectedId(state: EventsState): string | null {
  return state.selectedId;
}

export function selectLoaded(state: EventsState): boolean {
  return state.loaded;
}

/** 全部用户字段定义 */
export function selectFieldDefinitions(
  state: EventsState,
): FieldDefinitionsState {
  return state.definitions;
}

/** 指定模板的用户字段定义（表单合并与字典弹窗的读取入口） */
export function selectSchemaUserDefinition(
  state: EventsState,
  schemaId: string,
): StoredSchemaDefinition | undefined {
  return state.definitions.bySchemaId[schemaId];
}

/** 当前草稿渠道（跨 feature 消费：直发面板的未配置指引按渠道呈现）。
 *  入参收 RootState 形状（含 events 键即可），避免外部直读 draft 形状。 */
export function selectDraftChannelId(
  state: EventsState | { events: EventsState },
): ChannelId | undefined {
  const events = "events" in state ? state.events : state;
  return events.draft?.channelId;
}

/** 当前草稿 id（跨 feature 消费：直发面板随编辑对象切换复位）。
 *  入参收 RootState 形状（含 events 键即可）。 */
export function selectDraftId(
  state: EventsState | { events: EventsState },
): string | null {
  const events = "events" in state ? state.events : state;
  return events.draft?.id ?? null;
}
