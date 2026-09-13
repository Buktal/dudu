import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import { isConnectionReady } from "@/features/connections";
import {
  compareReceipt,
  resolveCurrentDraft,
  schemaById,
  wireBodyText,
} from "@/features/events";
import type { ChannelId } from "@/lib/channels";
import { errorMessage } from "@/lib/errors";
import type { RootState } from "@/store";

import {
  dispatchDouyin as dispatchDouyinApi,
  dispatchWecom as dispatchWecomApi,
  loadRuns,
  saveRun as saveRunApi,
  startScenarioRun as startScenarioRunApi,
  stopRun as stopRunApi,
} from "../api";
import {
  buildDirectRun,
  newRunId,
  type RunRecord,
  type RunStep,
  type SendOutcome,
  wecomSendOutcome,
} from "../model";
import { materializeRunSnapshot, type RunSnapshot } from "../snapshot";

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

/** 剧本运行阶段（运行按钮与进行中卡片消费） */
export type ScenarioRunPhase =
  | "idle"
  | "starting"
  | "running"
  | "needConnection"
  | "error";

/** 进行中运行的步骤状态（run-progress 事件驱动） */
export type LiveStepStatus =
  | "pending"
  | "waiting"
  | "success"
  | "failed"
  | "skipped";

/** 进行中运行的一个步骤：完成前只有事件名与状态，完成后携带快照 */
export type LiveRunStep = {
  eventName: string;
  status: LiveStepStatus;
  step?: RunStep;
};

/** 进行中的剧本运行（Rust 执行器经 run-progress 事件实时回报） */
export type LiveRun = {
  runId: string;
  sourceId?: string;
  scenarioName: string;
  channel: ChannelId;
  startedAt: string;
  steps: LiveRunStep[];
};

export type RunsState = {
  /** 持久化的运行记录（时间升序；视图展示时倒序） */
  items: RunRecord[];
  selectedId?: string | null;
  loaded: boolean;
  phase: DispatchPanelPhase;
  result: DispatchResult | null;
  /** phase = error 时的人类可读原因 */
  message: string;
  /** 剧本运行：进行中的运行（无则空） */
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

/** 直发结果：正常返回 needConnection/noop 分支或完整记录（异常走 rejected） */
type DirectDispatchResult =
  | { kind: "noop" }
  | { kind: "needConnection" }
  | {
      kind: "done";
      run: RunRecord;
      result: DispatchResult;
      persistenceError?: string;
    };

/** 直发当前事件草稿（未保存也可）。 */
export const directDispatch = createAsyncThunk<
  DirectDispatchResult,
  void,
  { state: RootState }
>(
  "runs/dispatchDirect",
  async (_, { getState, dispatch }) => {
    const state = getState();
    const draft = resolveCurrentDraft(state.events);
    if (!draft) {
      return { kind: "noop" };
    }
    const connection = state.connections.items[draft.channelId];
    if (!isConnectionReady(connection)) {
      // 未配置连接（缺条目/缺地址/缺密钥）：不报错，面板给「前往平台连接」指引
      return { kind: "needConnection" };
    }
    // 直发明文按渠道 wire 形态确定性拼装（抖音紧凑 JSON / 企微 XML），
    // 直发命令按渠道路由（douyin=JSON 签名 POST、wecom=XML 加密信封 POST）；
    // switch 穷尽——新增渠道时编译期在此强制显式决策
    const body = wireBodyText(schemaById(draft.schemaId), draft.payload);
    const runId = newRunId();
    const startedAt = new Date().toISOString();
    dispatch(directStarted({ runId, eventId: draft.id }));
    let outcome: SendOutcome;
    switch (connection.channel) {
      case "douyin": {
        const sent = await dispatchDouyinApi(connection, body, runId);
        outcome = {
          signature: sent.signature,
          msgId: sent.msgId,
          status: sent.status,
          elapsedMs: sent.elapsedMs,
          body: sent.body,
          error: sent.error,
        };
        break;
      }
      case "wecom": {
        const sent = await dispatchWecomApi(connection, body, runId);
        outcome = wecomSendOutcome(sent);
        break;
      }
      default: {
        const exhaustive: never = connection;
        return exhaustive;
      }
    }
    const verdict = compareReceipt(draft.expected, {
      status: outcome.status,
      body: outcome.body,
      reply: outcome.reply ?? undefined,
    });
    const run = buildDirectRun({
      runId,
      draft,
      url: connection.url,
      body,
      outcome,
      verdict,
      startedAt,
    });
    run.cancelled = getState().runs.stoppingRunId === runId;
    let persistenceError: string | undefined;
    try {
      await saveRunApi(run);
    } catch (error) {
      persistenceError = errorMessage(error);
    }
    return {
      kind: "done",
      run,
      result: { eventId: draft.id, runId: run.id, step: run.steps[0] },
      persistenceError,
    };
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

/** run-progress 事件载荷（Rust RunProgressEvent 的 camelCase 形态） */
export type RunProgressPayload = {
  runId: string;
  index: number;
  status: "waiting" | "success" | "failed" | "skipped" | "finished";
  /** 编排运行：进度所属 lane 序号（剧本运行/finished 无此字段） */
  lane?: number;
  /** 完成态（success/failed）携带完整步骤快照 */
  step?: RunStep;
  /** finished 携带完整运行记录 */
  run?: RunRecord;
  /** 完成记录落盘失败时保留快照并允许重试 */
  error?: string | null;
};

/** 快照 → 进行中运行（每步 pending，携带事件名与渠道供实时展示） */
function liveFromSnapshot(snapshot: RunSnapshot): LiveRun {
  return {
    runId: snapshot.runId,
    sourceId: snapshot.scenarioId,
    scenarioName: snapshot.scenarioName,
    channel: snapshot.steps[0]?.channel ?? "douyin",
    startedAt: snapshot.startedAt,
    steps: snapshot.steps.map((step) => ({
      eventName: step.eventName,
      status: "pending" as const,
    })),
  };
}

/** 剧本运行结果：正常返回 noop/needConnection 分支或 started（异常走 rejected） */
type ScenarioRunResult =
  | { kind: "noop" }
  | { kind: "needConnection" }
  | { kind: "started"; live: LiveRun };

/** 启动剧本运行（当前选中的剧本草稿）：
 *  物化快照（启动时固化，后续编辑不影响）→ invoke Rust 执行器 →
 *  命令立即返回 run id，进度由 run-progress 事件驱动 onRunProgress。 */
export const startScenarioRun = createAsyncThunk<
  ScenarioRunResult,
  { stepIndex: number } | undefined,
  { state: RootState }
>(
  "runs/startScenario",
  async (options, { getState, dispatch }) => {
    const state = getState();
    const scenario = state.scenarios.draft;
    if (!scenario) {
      return { kind: "noop" };
    }
    const connection = state.connections.items[scenario.channelId];
    if (!isConnectionReady(connection)) {
      return { kind: "needConnection" };
    }
    if (options && !scenario.steps[options.stepIndex])
      throw new Error("找不到要发送的步骤。");
    const snapshot = materializeRunSnapshot({
      scenario: options
        ? {
            ...scenario,
            steps: [{ ...scenario.steps[options.stepIndex], wait: 0 }],
          }
        : scenario,
      events: state.events.items,
      startedAt: new Date().toISOString(),
    });
    // 命令立即返回（run id 即 snapshot.runId）；进度由 run-progress 事件驱动
    const live = liveFromSnapshot(snapshot);
    dispatch(scenarioStarted(live));
    await startScenarioRunApi(snapshot, [connection]);
    return { kind: "started", live };
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

const runsSlice = createSlice({
  name: "runs",
  initialState: initialRunsState,
  reducers: {
    selectRun(state, action: PayloadAction<string>) {
      state.selectedId = action.payload;
    },
    directStarted(
      state,
      action: PayloadAction<{ runId: string; eventId: string }>,
    ) {
      state.directLive = action.payload;
    },
    scenarioStarted(state, action: PayloadAction<LiveRun>) {
      state.live = action.payload;
      state.scenarioRunPhase = "running";
    },
    /** 切换编辑对象时复位面板（运行记录不受影响） */
    clearDispatch(state) {
      if (state.phase !== "sending") state.phase = "idle";
      state.result = null;
      state.message = "";
    },
    /** run-progress 事件驱动：waiting/success/failed/skipped 更新 live，
     *  finished 把完整记录入列并清 live（组合根订阅一次事件后 dispatch）。
     *  编排运行（plans 域监听同一事件）的 finished 也入列历史，
     *  但不动本域的剧本运行状态。 */
    onRunProgress(state, action: PayloadAction<RunProgressPayload>) {
      const { runId, index, status, step, run, error } = action.payload;
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
        if (state.live?.runId === runId) {
          state.live = null;
          state.scenarioRunPhase = "idle";
        }
        if (state.stoppingRunId === runId) state.stoppingRunId = null;
        return;
      }
      const live = state.live;
      if (!live || live.runId !== runId) return;
      const target = live.steps[index];
      if (!target) return;
      if (status === "waiting" || status === "skipped") {
        target.status = status;
        return;
      }
      target.status = status;
      if (step) {
        target.step = step;
      }
    },
  },
  extraReducers: (builder) => {
    builder
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

export const {
  clearDispatch,
  directStarted,
  scenarioStarted,
  onRunProgress,
  selectRun,
} = runsSlice.actions;

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

export function selectLiveRun(state: RunsState): LiveRun | null {
  return state.live;
}

export function selectScenarioRunPhase(state: RunsState): ScenarioRunPhase {
  return state.scenarioRunPhase;
}

export function selectScenarioRunMessage(state: RunsState): string {
  return state.scenarioRunMessage;
}
