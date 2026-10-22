import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { WorkContext } from "../types";
import { accessReducers } from "./access-reducers";
import { choiceReducers } from "./choices-reducers";
import { detailReducers } from "./detail-reducers";
import { eventReducers } from "./event-reducers";
import { mediaReducers } from "./media-reducers";
import { parallelReducers } from "./parallel-reducers";
import { queueReducers } from "./queue-reducers";
import { readReducers } from "./read-reducers";
import { sendReducers } from "./send-reducers";
import { initialInboxState } from "./state";

/**
 * 未连接任何账户时的占位上下文：只作 reducer 缺省初值，登录后由真实上下文
 * 经 contextReset 替换；两个槽位都未连接，与 inbox-workspace.tsx 的独立工作台
 * 默认上下文语义不同。
 */
const UNCONNECTED_CONTEXT: WorkContext = {
  agentId: "unconnected",
  workspaceId: "unconnected",
};

/**
 * Single assembly seam for the inbox store: reducer transition shells stay in
 * their owning modules (queue, choice, send, read, event, parallel, detail)
 * and spread here so dispatch and the root reducer see one interface. The
 * spread adds no behavior by design — depth lives in the owning modules.
 */
const inboxSlice = createSlice({
  name: "inbox",
  initialState: initialInboxState(UNCONNECTED_CONTEXT),
  reducers: {
    ...readReducers,
    ...queueReducers,
    ...choiceReducers,
    ...detailReducers,
    ...sendReducers,
    ...eventReducers,
    ...mediaReducers,
    ...parallelReducers,
    ...accessReducers,
    contextReset(state, action: PayloadAction<WorkContext>) {
      return initialInboxState(action.payload, state.generation + 1);
    },
  },
});

export const inboxActions = inboxSlice.actions;
export const inboxReducer = inboxSlice.reducer;
