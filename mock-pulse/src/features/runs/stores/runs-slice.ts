import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import type { RootState } from "@/store";

import { loadRuns, saveRun as saveRunApi, stopRun as stopRunApi } from "../api";
import type { RunRecord } from "../model";
import type { DispatchPanelPhase, DispatchResult } from "./direct-dispatch";
import { directDispatch, directStarted } from "./direct-dispatch";
import {
  applyLiveProgress,
  type LiveRun,
  liveCleared,
  liveStarted,
  runProgress,
} from "./live";
import type { ScenarioRunPhase } from "./scenario-run";
import { startScenarioRun } from "./scenario-run";

/**
 * 运行记录域状态：持久化列表 + 直发面板（最近一次直发结果）+ 运行实况投影。
 * 直发与剧本运行 thunk 分别见 direct-dispatch / scenario-run（按职责拆分），
 * run-progress 事件投影与 Live 类型在 live.ts（组合根只 dispatch 一次
 * runProgress，本 slice 负责实况收敛、历史入列与阶段收束）。本文件收敛
 * 状态形状与选择器。
 */

export type RunsState = {
  /** 持久化的运行记录（时间升序；视图展示时倒序） */
  items: RunRecord[];
  selectedId?: string | null;
  loaded: boolean;
  phase: DispatchPanelPhase;
  result: DispatchResult | null;
  /** phase = error 时的人类可读原因 */
  message: string;
  /** 进行中的运行实况（剧本/编排统一投影，形状见 live.ts；无则空） */
  live: LiveRun | null;
  /** 剧本运行阶段 */
  scenarioRunPhase: ScenarioRunPhase;
  /** scenarioRunPhase = error 时的人类可读原因 */
  scenarioRunMessage: string;
  directLive?: { runId: string; eventId: string } | null;
  stoppingRunId?: string | null;
  persistenceErrors?: Record<string, string>;
};

export const initialRunsState: RunsState = {
  items: [],
  loaded: false,
  phase: "idle",
  result: null,
  message: "",
  live: null,
  scenarioRunPhase: "idle",
  scenarioRunMessage: "",
};

export const fetchRuns = createAsyncThunk("runs/fetch", async () => loadRuns());
export const stopRun = createAsyncThunk("runs/stop", async (runId: string) =>
  stopRunApi(runId),
);

export const retrySaveRun = createAsyncThunk<
  string,
  string,
  { state: RootState }
>("runs/retrySave", async (runId, { getState }) => {
  const run = getState().runs.items.find((item) => item.id === runId);
  if (!run) throw new Error("找不到要保存的运行记录。");
  await saveRunApi(run);
  return runId;
});

const runsSlice = createSlice({
  name: "runs",
  initialState: initialRunsState,
  reducers: {
    selectRun(state, action: PayloadAction<string>) {
      state.selectedId = action.payload;
    },
    /** 切换编辑对象时复位面板（运行记录不受影响） */
    clearDispatch(state) {
      if (state.phase !== "sending") state.phase = "idle";
      state.result = null;
      state.message = "";
    },
  },
  extraReducers: (builder) => {
    builder
      // run-progress 事件驱动：按 runId + lane 收敛实况（live.ts）；
      // finished 把完整记录入列历史并收束实况/阶段/停止态。
      .addCase(runProgress, (state, action) => {
        const { runId, status, run, error } = action.payload;
        if (status === "finished") {
          if (run) {
            state.items = [
              ...state.items.filter((item) => item.id !== run.id),
              run,
            ];
            if (error) {
              state.persistenceErrors ??= {};
              state.persistenceErrors[runId] = error;
            } else if (state.persistenceErrors)
              delete state.persistenceErrors[runId];
          }
          const live = state.live;
          if (live?.runId === runId) {
            state.live = null;
            // 剧本运行收束本域阶段；编排运行的阶段簿记在 plans 域
            if (live.kind === "scenario") state.scenarioRunPhase = "idle";
          }
          if (state.stoppingRunId === runId) state.stoppingRunId = null;
          return;
        }
        if (state.live?.runId === runId)
          applyLiveProgress(state.live, action.payload);
      })
      // 运行启动即投影（live 在 IPC 前初始化；剧本/编排共用，
      // plans 域在自己的 slice 里对 kind = plan 做阶段簿记）
      .addCase(liveStarted, (state, action) => {
        state.live = action.payload;
        if (action.payload.kind === "scenario")
          state.scenarioRunPhase = "running";
      })
      // 启动失败撤回投影（plans 域 IPC 失败时由 thunk 显式撤回）
      .addCase(liveCleared, (state, action) => {
        if (state.live?.runId === action.payload.runId) state.live = null;
      })
      .addCase(directStarted, (state, action) => {
        state.directLive = action.payload;
      })
      .addCase(fetchRuns.fulfilled, (state, action) => {
        state.items = Array.from(
          new Map(
            [...action.payload, ...state.items].map((run) => [run.id, run]),
          ).values(),
        );
        state.loaded = true;
      })
      .addCase(retrySaveRun.fulfilled, (state, action) => {
        if (state.persistenceErrors)
          delete state.persistenceErrors[action.payload];
      })
      .addCase(retrySaveRun.rejected, (state, action) => {
        state.persistenceErrors ??= {};
        state.persistenceErrors[action.meta.arg] =
          action.error.message ?? "运行记录保存失败";
      })
      .addCase(stopRun.pending, (state, action) => {
        state.stoppingRunId = action.meta.arg;
      })
      .addCase(stopRun.rejected, (state, action) => {
        if (state.stoppingRunId === action.meta.arg) state.stoppingRunId = null;
        state.message = action.error.message ?? "停止运行失败";
      })
      .addCase(directDispatch.pending, (state) => {
        state.phase = "sending";
        state.message = "";
      })
      .addCase(directDispatch.fulfilled, (state, action) => {
        if (state.stoppingRunId === state.directLive?.runId)
          state.stoppingRunId = null;
        state.directLive = null;
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
        const { run } = action.payload;
        state.items = [
          ...state.items.filter((item) => item.id !== run.id),
          run,
        ];
        if (action.payload.persistenceError) {
          state.persistenceErrors ??= {};
          state.persistenceErrors[action.payload.run.id] =
            action.payload.persistenceError;
        }
      })
      .addCase(directDispatch.rejected, (state, action) => {
        if (action.meta.condition) return;
        if (state.stoppingRunId === state.directLive?.runId)
          state.stoppingRunId = null;
        state.directLive = null;
        state.phase = "error";
        state.message = action.error.message ?? "发送失败";
      })
      .addCase(startScenarioRun.pending, (state) => {
        state.scenarioRunPhase = "starting";
        state.scenarioRunMessage = "";
      })
      .addCase(startScenarioRun.fulfilled, (state, action) => {
        if (action.payload.kind === "noop") {
          state.scenarioRunPhase = "idle";
          return;
        }
        if (action.payload.kind === "needConnection") {
          state.scenarioRunPhase = "needConnection";
          return;
        }
        // live 在 IPC 前初始化；完成事件可能早于命令返回，不能在这里复活运行。
        if (state.live?.runId === action.payload.live.runId)
          state.scenarioRunPhase = "running";
      })
      .addCase(startScenarioRun.rejected, (state, action) => {
        if (action.meta.condition) return;
        state.live = null;
        state.scenarioRunPhase = "error";
        state.scenarioRunMessage = action.error.message ?? "启动运行失败";
      });
  },
});

export const { clearDispatch, selectRun } = runsSlice.actions;

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

export function selectScenarioRunPhase(state: RunsState): ScenarioRunPhase {
  return state.scenarioRunPhase;
}

export function selectScenarioRunMessage(state: RunsState): string {
  return state.scenarioRunMessage;
}
