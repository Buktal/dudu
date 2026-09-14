import { createAction, createAsyncThunk } from "@reduxjs/toolkit";

import {
  resolveCurrentDraft,
  schemaById,
  wireBodyText,
} from "@/features/events";
import { errorMessage } from "@/lib/errors";
import type { RootState } from "@/store";

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
import { canStartRun, missingConnections } from "./session";

/**
 * 直发流（ADR-0005：Rust 做重活）：前置检查（草稿/连接）→ 一次 invoke——
 * Rust 按渠道路由发送、比对期望并组装成品单步快照 → 运行记录落盘入列。
 * 启动互斥与连接就绪门由运行会话模块裁决（session.ts）。
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

/** 直发进行中面板态（发送中展示 + 停止按钮定位当前 run） */
export const directStarted = createAction<{ runId: string; eventId: string }>(
  "runs/directStarted",
);

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
    if (missingConnections(state, [draft.channelId]).length > 0) {
      // 未配置连接（缺条目/缺地址/缺密钥）：不报错，面板给「前往平台连接」指引
      return { kind: "needConnection" };
    }
    // 直发明文按渠道 wire 形态确定性拼装（抖音紧凑 JSON / 企微 XML）；
    // 发送、期望比对与单步快照组装都在 Rust 直发命令完成（取消语义由
    // 命令返回值自带：cancelled 覆盖「停止先于发送/停止发生在在途」）
    const body = wireBodyText(schemaById(draft.schemaId), draft.payload);
    const runId = newRunId();
    const startedAt = new Date().toISOString();
    dispatch(directStarted({ runId, eventId: draft.id }));
    const sent = await dispatchDirectApi(connection, {
      body,
      eventName: draft.name,
      eventId: draft.id,
      expected: draft.expected,
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
      result: { eventId: draft.id, runId: run.id, step: run.steps[0] },
      persistenceError,
    };
  },
  {
    condition: (_, { getState }) => canStartRun(getState()).ok,
  },
);
