import type { PayloadAction } from "@reduxjs/toolkit";
import type { InboxState } from "./state";

export const parallelReducers = {
  parallelEntered(state: InboxState) {
    const replyId = state.replyId;
    if (!replyId || !state.conversations[replyId]) return;
    if (replyId === state.pinnedId) {
      state.pinCollapsed = false;
      if (state.activeId === replyId) state.activeId = null;
    } else state.activeId = replyId;
  },
  pinnedCollapsed(state: InboxState) {
    if (!state.pinnedId || state.pinCollapsed) return;
    state.pinCollapsed = true;
    if (state.replyId === state.pinnedId) state.replyId = state.activeId;
    state.selectionRevision++;
    state.notice = null;
  },
  pinnedReleased(state: InboxState) {
    if (!state.pinnedId) return;
    if (state.replyId === state.pinnedId) state.replyId = state.activeId;
    state.pinnedId = null;
    state.pinCollapsed = false;
    state.selectionRevision++;
    state.notice = null;
  },
  conversationPinned(state: InboxState, action: PayloadAction<string>) {
    state.pinnedId = action.payload;
    state.pinCollapsed = false;
    if (state.activeId === action.payload) state.activeId = null;
    state.replyId = action.payload;
    state.selectionRevision++;
    state.notice = null;
  },
  pinnedRestored(state: InboxState) {
    if (!state.pinnedId) return;
    if (state.activeId === state.pinnedId) state.activeId = null;
    state.pinCollapsed = false;
    state.replyId = state.pinnedId;
    state.selectionRevision++;
    state.notice = null;
  },
};
