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
  isDraftDirty,
} from "../model";
import {
  parseFieldText,
  parseWireDraft,
  setPayloadField,
  syncSenderIdentity,
} from "../payload";
import { editorPayload } from "../payload/json";
import type { FieldDescriptor } from "../schemas";
import { schemaById, type WirePayload } from "../schemas";

/** 素材库筛选：搜索 + 渠道 + 类型（纯 selector，列表渲染交给 react-virtuoso） */
export type EventFilters = {
  query: string;
  channel: ChannelId | "all";
  kind: "all" | "message" | "event" | "favorite";
};

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
  /**
   * 草稿自打开 / 新建 / 保存后是否被编辑过。派生比较只能判内容差，
   * 判不了「人动手没」——未保存过的新草稿内容恒与空存量不同，
   * 不加此标记，点一下模板再点事件就会误报未保存（DraftGuard 误拦）。
   */
  touched: boolean;
  /** 未应用的完整报文也属于草稿；切换功能区时保留，包括暂不合法的输入。 */
  rawText: string | null;
  fieldInputs?: Record<string, { text: string; error?: string }>;
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
  touched: false,
  rawText: null,
  fieldInputs: {},
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
    const draft = resolveCurrentDraft(events);
    if (!draft) {
      throw new Error("没有可保存的草稿。");
    }
    if (!draft.name.trim()) {
      throw new Error("请填写事件名称。");
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

export const saveEventAs = createAsyncThunk(
  "events/saveAs",
  async (name: string, { getState }) => {
    const { events } = getState() as EventsRoot;
    const draft = resolveCurrentDraft(events);
    if (!draft || !name.trim()) throw new Error("请填写新名称。");
    const copy = {
      ...duplicateDraft(draft),
      name: name.trim(),
      favorite: false,
    };
    const items = await saveEventApi(
      appendVersion(null, copy, new Date().toISOString()),
    );
    return {
      items,
      copy,
      source: JSON.stringify(events.draft),
      rawText: events.rawText,
    };
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
      state.touched = false;
      state.rawText = null;
      state.fieldInputs = {};
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
      state.touched = false;
      state.rawText = null;
      state.fieldInputs = {};
    },
    /** 表单修改一个字段；同步开关开启时发送者 ID 跟随资料 ID */
    setDraftField(
      state,
      action: PayloadAction<{ path: string; value: unknown }>,
    ) {
      if (!state.draft) return;
      state.touched = true;
      const schema = schemaById(state.draft.schemaId);
      if (state.rawText != null) {
        state.draft.payload = editorPayload(
          schema,
          parseWireDraft(schema, state.rawText),
        );
        state.rawText = null;
      }
      let payload = setPayloadField(
        state.draft.payload,
        action.payload.path,
        action.payload.value,
      );
      if (state.draft.senderSync && action.payload.path === "from_user_id") {
        payload = syncSenderIdentity(schema, payload);
      }
      state.draft.payload = payload;
      if (state.fieldInputs) delete state.fieldInputs[action.payload.path];
    },
    editFieldText(
      state,
      action: PayloadAction<{ path: string; text: string; type: string }>,
    ) {
      if (!state.draft) return;
      state.touched = true;
      const { path, text, type } = action.payload;
      state.fieldInputs ??= {};
      state.fieldInputs[path] = { text };
      try {
        // 转换与校验（number 有限性 / JSON / XML 文本约束）单点在 payload.ts
        const schema = schemaById(state.draft.schemaId);
        const value = parseFieldText(type, text, schema.wire);
        if (state.rawText != null) {
          state.draft.payload = editorPayload(
            schema,
            parseWireDraft(schema, state.rawText),
          );
          state.rawText = null;
        }
        state.draft.payload = setPayloadField(state.draft.payload, path, value);
        if (state.draft.senderSync && path === "from_user_id") {
          state.draft.payload = syncSenderIdentity(schema, state.draft.payload);
          delete state.fieldInputs["content.user_infos[0].open_id"];
        }
      } catch (cause) {
        state.fieldInputs[path].error =
          cause instanceof Error ? cause.message : "请输入有效的参数值。";
      }
    },
    /** 完整报文应用回字段（组件已校验合法性；contentString 解析为表单形态） */
    setDraftPayload(state, action: PayloadAction<WirePayload>) {
      if (!state.draft) return;
      state.touched = true;
      const schema = schemaById(state.draft.schemaId);
      state.draft.payload = editorPayload(schema, action.payload);
      state.rawText = null;
      state.fieldInputs = {};
    },
    setDraftRawText(state, action: PayloadAction<string>) {
      if (!state.draft) return;
      state.touched = true;
      state.rawText = action.payload;
    },
    setDraftName(state, action: PayloadAction<string>) {
      if (!state.draft) return;
      state.touched = true;
      state.draft.name = action.payload;
    },
    toggleEventFavorite(state) {
      if (!state.draft) return;
      state.draft.favorite = !state.draft.favorite;
      state.touched = true;
    },
    /** 编辑期望回执（Partial 合并：状态码 / 形态 / 期望正文） */
    setDraftExpected(state, action: PayloadAction<Partial<ExpectedReceipt>>) {
      if (!state.draft) return;
      state.touched = true;
      state.draft.expected = { ...state.draft.expected, ...action.payload };
    },
    /** 发送者 ID 显式同步开关：开启即对齐资料 open_id */
    toggleSenderSync(state) {
      if (!state.draft) return;
      state.touched = true;
      state.draft.senderSync = !state.draft.senderSync;
      if (state.draft.senderSync) {
        state.draft.payload = syncSenderIdentity(
          schemaById(state.draft.schemaId),
          state.draft.payload,
        );
        if (state.fieldInputs)
          delete state.fieldInputs["content.user_infos[0].open_id"];
      }
    },
    /** 复制 = 新事件携带当前载荷草稿（新 id 未保存，显式置脏） */
    duplicateCurrentDraft(state) {
      if (!state.draft) return;
      const resolved = resolveCurrentDraft(state);
      if (!resolved) return;
      state.draft = duplicateDraft(resolved);
      state.selectedId = null;
      state.touched = true;
      state.rawText = null;
      state.fieldInputs = {};
    },
    discardDraft(state) {
      if (!state.draft) return;
      const item = state.items.find((entry) => entry.id === state.draft?.id);
      state.draft = item ? draftFromItem(item) : null;
      state.touched = false;
      state.rawText = null;
      state.fieldInputs = {};
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
        if (action.payload.some((item) => item.id === state.draft?.id))
          state.selectedId = state.draft?.id ?? null;
        // 回包只清「保存瞬间」的脏：保存途中又动手的，脏保留
        //（savePlanAs/saveEventAs 式 source 比对的同例，此处按回包重算）。
        try {
          const draft = resolveCurrentDraft(state);
          const saved =
            action.payload.find((item) => item.id === state.draft?.id) ?? null;
          state.touched = draft !== null && isDraftDirty(saved, draft);
        } catch {
          state.touched = true;
        }
      })
      .addCase(saveEventAs.fulfilled, (state, action) => {
        state.items = action.payload.items;
        if (
          JSON.stringify(state.draft) !== action.payload.source ||
          state.rawText !== action.payload.rawText
        )
          return;
        state.draft = action.payload.copy;
        state.selectedId = action.payload.copy.id;
        state.touched = false;
        state.rawText = null;
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
        if (state.draft?.id === action.meta.arg) {
          state.draft = null;
          state.selectedId = null;
          state.touched = false;
          state.rawText = null;
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
  setDraftRawText,
  setFilters,
  setPage,
  startDraft,
  toggleSenderSync,
  toggleEventFavorite,
  editFieldText,
} = eventsSlice.actions;

export const eventsReducer = eventsSlice.reducer;

/** 保存、复制、直发共用当前可见参数；未解析的报文不能退回旧载荷发送。 */
export function resolveCurrentDraft(state: EventsState): EventDraft | null {
  const invalid = Object.entries(state.fieldInputs ?? {}).find(
    ([, input]) => input.error,
  );
  if (invalid)
    throw new Error(`请先修正参数 ${invalid[0]}：${invalid[1].error}`);
  if (
    state.draft &&
    (!Number.isInteger(state.draft.expected.status) ||
      state.draft.expected.status < 100 ||
      state.draft.expected.status > 599)
  )
    throw new Error("期望 HTTP 状态须为 100 到 599 的整数。");
  if (!state.draft || state.rawText === null || state.rawText === undefined) {
    return state.draft;
  }
  const schema = schemaById(state.draft.schemaId);
  return {
    ...state.draft,
    payload: editorPayload(schema, parseWireDraft(schema, state.rawText)),
  };
}

export function selectDraftDirty(state: EventsState): boolean {
  // 没动手就不脏：派生比较判内容差，touched 判人动手没。
  // 未保存过的新草稿内容恒与空存量不同，只看派生比较会误报。
  if (!state.draft || !state.touched) return false;
  try {
    const draft = resolveCurrentDraft(state);
    const saved =
      state.items.find((item) => item.id === state.draft?.id) ?? null;
    return draft !== null && isDraftDirty(saved, draft);
  } catch {
    return true;
  }
}

/** 持久化文档 → slice 内 definitions 状态 */
function definitionsFromDoc(doc: DefinitionsDoc): FieldDefinitionsState {
  return { loaded: true, bySchemaId: doc.schemas };
}

// ---- 只读 selector（状态定义处实现，selectors.ts 只留 facade 重导出）----

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
