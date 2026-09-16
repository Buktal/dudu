import { type Action, createAction } from "@reduxjs/toolkit";

import {
  type ConnectionConfig,
  isConnectionReady,
} from "@/features/connections";
import type { ExpectedReceipt } from "@/features/events";
import type { ChannelId } from "@/lib/channels";
import { errorMessage } from "@/lib/errors";

import {
  dispatchDirect as dispatchDirectApi,
  saveRun as saveRunApi,
} from "../api";
import {
  directRunRecord,
  newRunId,
  type RunRecord,
  type RunStep,
} from "../model";
import { type LiveRun, startLiveRun } from "./live";
import { missingConnections, type RunSessionState } from "./session";

/**
 * 运行启动收敛：直发 / 剧本 / 编排三条启动路径的唯一编排点。
 * 启动资格与连接门（session.ts）、实况投影与启动骨架（live.ts）仍是
 * 各自模块的职责；本模块拥有三者的调用顺序——门禁 → 物化 → 投影 →
 * invoke →（直发）落盘。三个 thunk 只做各自输入的整形，不再各自
 * 编排顺序；顺序类 faults 在此集中。
 */

/** 启动编排所需的全局状态：运行会话视角 + 连接表（结构化最小形状） */
export type LaunchState = RunSessionState & {
  connections: { items: Record<string, ConnectionConfig | undefined> };
};

/** 启动骨架所需的 store 形状（thunk 的 getState/dispatch 直接传入） */
export type LaunchStore = {
  getState: () => LaunchState;
  dispatch: (action: Action) => unknown;
};

/** 直发启动即面板簿记（发送中展示 + 停止按钮定位当前 run） */
export const directStarted = createAction<{ runId: string; eventId: string }>(
  "runs/directStarted",
);

/** 直发面板阶段 */
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

/** 直发结果：正常返回 needConnection/noop 分支或完整记录（异常走 rejected） */
export type DirectDispatchResult =
  | { kind: "noop" }
  | { kind: "needConnection" }
  | {
      kind: "done";
      run: RunRecord;
      result: DispatchResult;
      persistenceError?: string;
    };

/** 直发明文编译结果（门禁通过后一次 invoke 的全部输入） */
export type DirectCompile = {
  channel: ChannelId;
  body: string;
  eventName: string;
  eventId: string;
  expected: ExpectedReceipt;
};

/**
 * 直发启动（ADR-0005：Rust 做重活）：编译草稿（null = 无草稿 noop）→
 * 连接门（单渠道就绪判定）→ 一次 invoke（Rust 发送、比对、组装成品
 * 单步快照）→ 运行记录落盘入列（落盘失败保留快照，错误随结果返回）。
 */
export async function launchDirectRun(
  compile: () => DirectCompile | null,
  store: LaunchStore,
): Promise<DirectDispatchResult> {
  const compiled = compile();
  if (!compiled) {
    return { kind: "noop" };
  }
  const connection = store.getState().connections.items[compiled.channel];
  if (!connection || !isConnectionReady(connection)) {
    // 未配置连接（缺条目/缺地址/缺密钥）：不报错，面板给「前往平台连接」指引
    return { kind: "needConnection" };
  }
  // 直发明文按渠道 wire 形态确定性拼装已在 compile 完成（抖音紧凑 JSON /
  // 企微 XML）；发送、期望比对与单步快照组装都在 Rust 直发命令完成
  // （取消语义由命令返回值自带：cancelled 覆盖「停止先于发送/停止发生在在途」）
  const runId = newRunId();
  const startedAt = new Date().toISOString();
  store.dispatch(directStarted({ runId, eventId: compiled.eventId }));
  const sent = await dispatchDirectApi(connection, {
    body: compiled.body,
    eventName: compiled.eventName,
    eventId: compiled.eventId,
    expected: compiled.expected,
    runId,
  });
  const run = directRunRecord({
    runId,
    startedAt,
    cancelled: sent.cancelled,
    step: sent.step,
  });
  let persistenceError: string | undefined;
  try {
    await saveRunApi(run);
  } catch (error) {
    persistenceError = errorMessage(error);
  }
  return {
    kind: "done",
    run,
    result: { eventId: compiled.eventId, runId: run.id, step: run.steps[0] },
    persistenceError,
  };
}

/** 实况投影型启动的输入：物化快照 → 投影实况 → invoke（连接由本模块按门禁解析） */
export type ProjectedLaunch<S> = {
  /** 连接门输入（去重渠道；缺失按首次出现顺序返回） */
  channels: readonly ChannelId[];
  /** 快照物化（启动时固化；失败抛可读错误 → rejected，不产半成品） */
  materialize: () => S;
  /** 快照 → 实况投影种子 */
  toLive: (snapshot: S) => LiveRun;
  /** IPC 调用（命令立即返回，进度由 run-progress 事件驱动） */
  invoke: (snapshot: S, connections: ConnectionConfig[]) => Promise<unknown>;
};

/** 投影型启动结果：剧本/编排 thunk 各自映射为本域的结果形状 */
export type ProjectedOutcome =
  | { kind: "noop" }
  | { kind: "needConnection"; channels: ChannelId[] }
  | { kind: "started"; live: LiveRun };

/**
 * 投影型启动：连接门（去重渠道逐一确认）→ 按门禁解析连接 → 物化快照 →
 * 实况投影（IPC 前初始化，供立即停止与实时进度）→ invoke。
 * IPC 失败由启动骨架撤回投影后原样抛出。
 */
export async function launchProjectedRun<S>(
  request: ProjectedLaunch<S>,
  store: LaunchStore,
): Promise<ProjectedOutcome> {
  const state = store.getState();
  const missing = missingConnections(state, request.channels);
  if (missing.length > 0) {
    return { kind: "needConnection", channels: missing };
  }
  // 门禁已过：渠道连接必就绪；flatMap 兜住类型（缺席即空，不静默错配）
  const connections = request.channels.flatMap((channel) => {
    const connection = state.connections.items[channel];
    return connection ? [connection] : [];
  });
  const snapshot = request.materialize();
  const live = request.toLive(snapshot);
  await startLiveRun(live, store.dispatch, () =>
    request.invoke(snapshot, connections),
  );
  return { kind: "started", live };
}
