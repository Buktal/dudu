import type { PayloadAction } from "@reduxjs/toolkit";
import type { InboxState } from "./state";

/**
 * Reception workspace placement reducers: own every pinned/parallel/
 * quick-history transition. The layout mode (calm/parallel/quick) is a
 * separate seam owned by the theme module; this module only owns *which*
 * conversations sit in the primary/pinned/history slots.
 */
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
  quickHistoryChanged(state: InboxState, action: PayloadAction<string | null>) {
    state.quickHistoryId = action.payload;
  },
};
