import { createAsyncThunk } from "@reduxjs/toolkit";

import {
  resolveCurrentDraft,
  schemaById,
  wireBodyText,
} from "@/features/events";
import type { RootState } from "@/store";

import { type DirectDispatchResult, launchDirectRun } from "./launch";
import { canStartRun } from "./session";

export {
  type DirectDispatchResult,
  type DispatchPanelPhase,
  type DispatchResult,
  directStarted,
} from "./launch";

/**
 * 直发流（ADR-0005：Rust 做重活）：草稿整形在此，启动顺序（门禁 →
 * invoke → 落盘）在运行启动模块（launch.ts）收敛，直发 / 剧本 /
 * 编排三条路径共用同一顺序。启动互斥与连接就绪门由运行会话模块
 * 裁决（session.ts）。
 */

/** 直发当前事件草稿（未保存也可）。 */
export const directDispatch = createAsyncThunk<
  DirectDispatchResult,
  void,
  { state: RootState }
>(
  "runs/dispatchDirect",
  async (_, { getState, dispatch }) =>
    launchDirectRun(
      () => {
        const draft = resolveCurrentDraft(getState().events);
        if (!draft) {
          return null;
        }
        return {
          channel: draft.channelId,
          // 直发明文按渠道 wire 形态确定性拼装（抖音紧凑 JSON / 企微 XML）
          body: wireBodyText(schemaById(draft.schemaId), draft.payload),
          eventName: draft.name,
          eventId: draft.id,
          expected: draft.expected,
        };
      },
      { getState, dispatch },
    ),
  {
    condition: (_, { getState }) => canStartRun(getState()).ok,
  },
);
