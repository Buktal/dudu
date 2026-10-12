import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { WorkContext } from "../types";
import { accessReducers } from "./access-reducers";
import { attachmentReducers } from "./attachment-reducers";
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
 * Single assembly seam for the inbox store: reducer transition shells stay in
 * their owning modules (queue, choice, send, read, event, parallel,
 * attachment, detail) and spread here so dispatch and the root reducer see
 * one interface. The spread adds no behavior by design — depth lives in the
 * owning modules.
 */
const inboxSlice = createSlice({
  name: "inbox",
  initialState: initialInboxState({
    agentId: "unconnected",
    workspaceId: "unconnected",
  }),
  reducers: {
    ...readReducers,
    ...queueReducers,
    ...choiceReducers,
    ...detailReducers,
    ...sendReducers,
    ...eventReducers,
    ...mediaReducers,
    ...parallelReducers,
    ...attachmentReducers,
    ...accessReducers,
    contextReset(state, action: PayloadAction<WorkContext>) {
      return initialInboxState(action.payload, state.generation + 1);
    },
  },
});

export const inboxActions = inboxSlice.actions;
export const inboxReducer = inboxSlice.reducer;
