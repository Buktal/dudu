import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import {
  type DefinitionsDoc,
  loadDefinitions,
  type StoredSchemaDefinition,
  saveDefinition,
} from "../api";
import type { FieldDescriptor } from "../schemas";

/**
 * 用户字段定义 slice（#22）：按 schemaId 覆写随应用分发的渠道描述基线
 * （../definitions 的 loader / io），字典「应用说明」写库经此生效。
 * 与素材库事件状态（events-slice）同域不同职，独立顶层 slice 各挂一键
 * （events-slice 超 500 行红线，本子域拆出独立收放）。
 */

export type FieldDefinitionsState = {
  loaded: boolean;
  bySchemaId: Record<string, StoredSchemaDefinition>;
};

const initialDefinitionsState: FieldDefinitionsState = {
  loaded: false,
  bySchemaId: {},
};

/** 装载用户字段定义（启动时随事件视图拉取） */
export const fetchFieldDefinitions = createAsyncThunk(
  "fieldDefinitions/fetch",
  async () => loadDefinitions(),
);

/** 字典「应用说明」：把生效字段写成该 schemaId 的用户定义并持久化 */
export const applyFieldDefinitions = createAsyncThunk(
  "fieldDefinitions/apply",
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

/** 持久化文档 → slice 状态（fetch / apply 两 thunk 同构收编） */
function definitionsFromDoc(
  state: FieldDefinitionsState,
  action: PayloadAction<DefinitionsDoc>,
) {
  state.loaded = true;
  state.bySchemaId = action.payload.schemas;
}

const definitionsSlice = createSlice({
  name: "fieldDefinitions",
  initialState: initialDefinitionsState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchFieldDefinitions.fulfilled, definitionsFromDoc)
      .addCase(applyFieldDefinitions.fulfilled, definitionsFromDoc);
  },
});

export const definitionsReducer = definitionsSlice.reducer;

/** 全部用户字段定义 */
export function selectFieldDefinitions(
  state: FieldDefinitionsState,
): FieldDefinitionsState {
  return state;
}

/** 指定模板的用户字段定义（表单合并与字典弹窗的读取入口） */
export function selectSchemaUserDefinition(
  state: FieldDefinitionsState,
  schemaId: string,
): StoredSchemaDefinition | undefined {
  return state.bySchemaId[schemaId];
}
