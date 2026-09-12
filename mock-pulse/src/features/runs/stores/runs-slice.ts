import {
  createAsyncThunk,
  createSlice,
  type PayloadAction,
} from "@reduxjs/toolkit";

import { isConnectionReady } from "@/features/connections";
import { compareReceipt, schemaById, wireBodyText } from "@/features/events";
import type { ChannelId } from "@/lib/channels";
import type { RootState } from "@/store";

import {
  dispatchDouyin as dispatchDouyinApi,
  dispatchWecom as dispatchWecomApi,
  loadRuns,
  saveRun as saveRunApi,
  startScenarioRun as startScenarioRunApi,
} from "../api";
import {
  buildDirectRun,
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
  scenarioName: string;
  channel: ChannelId;
  startedAt: string;
  steps: LiveRunStep[];
};

export type RunsState = {
  /** 持久化的运行记录（时间升序；视图展示时倒序） */
  items: RunRecord[];
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
  // 直发明文按渠道 wire 形态确定性拼装（抖音紧凑 JSON / 企微 XML），
  // 直发命令按渠道路由（douyin=JSON 签名 POST、wecom=XML 加密信封 POST）；
  // switch 穷尽——新增渠道时编译期在此强制显式决策
  const body = wireBodyText(schemaById(draft.schemaId), draft.payload);
  let outcome: SendOutcome;
  switch (connection.channel) {
    case "douyin": {
      const sent = await dispatchDouyinApi(connection, body);
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
      const sent = await dispatchWecomApi(connection, body);
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

/** run-progress 事件载荷（Rust RunProgressEvent 的 camelCase 形态） */
export type RunProgressPayload = {
  runId: string;
  index: number;
  status: "waiting" | "success" | "failed" | "skipped" | "finished";
  /** 完成态（success/failed）携带完整步骤快照 */
  step?: RunStep;
  /** finished 携带完整运行记录 */
  run?: RunRecord;
};

/** 快照 → 进行中运行（每步 pending，携带事件名与渠道供实时展示） */
function liveFromSnapshot(snapshot: RunSnapshot): LiveRun {
  return {
    runId: snapshot.runId,
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
  void,
  { state: RootState }
>("runs/startScenario", async (_, { getState }) => {
  const state = getState();
  const scenario = state.scenarios.draft;
  if (!scenario) {
    return { kind: "noop" };
  }
  const connection = state.connections.items[scenario.channelId];
  if (!isConnectionReady(connection)) {
    return { kind: "needConnection" };
  }
  const snapshot = materializeRunSnapshot({
    scenario,
    events: state.events.items,
    startedAt: new Date().toISOString(),
  });
  // 命令立即返回（run id 即 snapshot.runId）；进度由 run-progress 事件驱动
  await startScenarioRunApi(snapshot, [connection]);
  return { kind: "started", live: liveFromSnapshot(snapshot) };
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
    /** run-progress 事件驱动：waiting/success/failed/skipped 更新 live，
     *  finished 把完整记录入列并清 live（组合根订阅一次事件后 dispatch）。 */
    onRunProgress(state, action: PayloadAction<RunProgressPayload>) {
      const { runId, index, status, step, run } = action.payload;
      if (status === "finished") {
        if (run) {
          state.items = [...state.items, run];
        }
        if (state.live?.runId === runId) {
          state.live = null;
        }
        if (state.scenarioRunPhase === "running") {
          state.scenarioRunPhase = "idle";
        }
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
        state.scenarioRunPhase = "running";
        state.live = action.payload.live;
      })
      .addCase(startScenarioRun.rejected, (state, action) => {
        state.scenarioRunPhase = "error";
        state.scenarioRunMessage = action.error.message ?? "启动运行失败";
      });
  },
});

export const { clearDispatch, onRunProgress } = runsSlice.actions;

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
