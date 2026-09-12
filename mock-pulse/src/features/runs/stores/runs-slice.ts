import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";

import { isConnectionReady } from "@/features/connections";
import { compareReceipt, schemaById, wireBodyText } from "@/features/events";
import type { RootState } from "@/store";

import {
  dispatchDouyin as dispatchDouyinApi,
  loadRuns,
  saveRun as saveRunApi,
} from "../api";
import { buildDirectRun, type RunRecord, type RunStep } from "../model";

/**
 * 运行记录域状态：持久化列表 + 直发面板（最近一次直发结果）。
 * 直发流程：拼明文 → 读连接（未配置给指引）→ Rust 签名 POST →
 * 期望比对 → 单步运行记录落盘 → 面板展示回执与结论。
 */

export type DispatchPanelPhase =
  | "idle"
  | "sending"
  | "needConnection"
  | "error"
  | "done";

/** 面板展示的最近一次直发结果快照 */
export type DispatchResult = {
  eventId: string;
  runId: string;
  step: RunStep;
};

export type RunsState = {
  /** 持久化的运行记录（时间升序；视图展示时倒序） */
  items: RunRecord[];
  loaded: boolean;
  phase: DispatchPanelPhase;
  result: DispatchResult | null;
  /** phase = error 时的人类可读原因 */
  message: string;
};

export const initialRunsState: RunsState = {
  items: [],
  loaded: false,
  phase: "idle",
  result: null,
  message: "",
};

export const fetchRuns = createAsyncThunk("runs/fetch", async () => loadRuns());

/** 直发结果：正常返回 needConnection/noop 分支或完整记录（异常走 rejected） */
type DirectDispatchResult =
  | { kind: "noop" }
  | { kind: "needConnection" }
  | { kind: "done"; run: RunRecord; result: DispatchResult };

/** 直发当前事件草稿（未保存也可）。 */
export const directDispatch = createAsyncThunk<
  DirectDispatchResult,
  void,
  { state: RootState }
>("runs/dispatchDirect", async (_, { getState }) => {
  const state = getState();
  const draft = state.events.draft;
  if (!draft) {
    return { kind: "noop" };
  }
  const connection = state.connections.items[draft.channelId];
  if (!isConnectionReady(connection)) {
    // 未配置连接（缺条目/缺地址/缺密钥）：不报错，面板给「前往平台连接」指引
    return { kind: "needConnection" };
  }
  const schema = schemaById(draft.schemaId);
  const body = wireBodyText(schema, draft.payload);
  const outcome = await dispatchDouyinApi(connection, body);
  const verdict = compareReceipt(draft.expected, {
    status: outcome.status,
    body: outcome.body,
  });
  const run = buildDirectRun({
    draft,
    url: connection.url,
    body,
    outcome,
    verdict,
    startedAt: new Date().toISOString(),
  });
  await saveRunApi(run);
  return {
    kind: "done",
    run,
    result: { eventId: draft.id, runId: run.id, step: run.steps[0] },
  };
});

const runsSlice = createSlice({
  name: "runs",
  initialState: initialRunsState,
  reducers: {
    /** 切换编辑对象时复位面板（运行记录不受影响） */
    clearDispatch(state) {
      state.phase = "idle";
      state.result = null;
      state.message = "";
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchRuns.fulfilled, (state, action) => {
        state.items = action.payload;
        state.loaded = true;
      })
      .addCase(directDispatch.pending, (state) => {
        state.phase = "sending";
        state.message = "";
      })
      .addCase(directDispatch.fulfilled, (state, action) => {
        if (action.payload.kind === "noop") {
          state.phase = "idle";
          return;
        }
        if (action.payload.kind === "needConnection") {
          state.phase = "needConnection";
          return;
        }
        state.phase = "done";
        state.result = action.payload.result;
        state.items = [...state.items, action.payload.run];
      })
      .addCase(directDispatch.rejected, (state, action) => {
        state.phase = "error";
        state.message = action.error.message ?? "发送失败";
      });
  },
});

export const { clearDispatch } = runsSlice.actions;

export const runsReducer = runsSlice.reducer;

export function selectRuns(state: RunsState): RunRecord[] {
  return state.items;
}

export function selectPanelPhase(state: RunsState): DispatchPanelPhase {
  return state.phase;
}

export function selectLastDispatch(state: RunsState): DispatchResult | null {
  return state.result;
}

export function selectPanelMessage(state: RunsState): string {
  return state.message;
}
