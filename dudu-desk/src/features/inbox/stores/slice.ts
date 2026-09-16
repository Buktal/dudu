import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { WorkContext } from "../types";
import { attachmentReducers } from "./attachment-reducers";
import { detailReducers } from "./detail-reducers";
import { eventReducers } from "./event-reducers";
import { parallelReducers } from "./parallel-reducers";
import { queueReducers } from "./queue-reducers";
import { readReducers } from "./read-reducers";
import { sendReducers } from "./send-reducers";
import { initialInboxState } from "./state";

const inboxSlice = createSlice({
  name: "inbox",
  initialState: initialInboxState({
    agentId: "unconnected",
    workspaceId: "unconnected",
  }),
  reducers: {
    ...readReducers,
    ...queueReducers,
    ...detailReducers,
    ...sendReducers,
    ...eventReducers,
    ...parallelReducers,
    ...attachmentReducers,
    contextReset(state, action: PayloadAction<WorkContext>) {
      return initialInboxState(action.payload, state.generation + 1);
    },
  },
});

export const inboxActions = inboxSlice.actions;
export const inboxReducer = inboxSlice.reducer;
