import { createSelector } from "@reduxjs/toolkit";
import type { InboxRootState } from "./store";

/**
 * Re-exported from the Conversation queue module (queue.ts), which owns the
 * queue read interface alongside the refresh/more/retry lifecycle.
 */
export {
  selectQueueConversations,
  selectQuickQueueConversations,
} from "./queue";

export const selectInbox = (state: InboxRootState) => state.inbox;
export const selectQueue = (state: InboxRootState) => state.inbox.queue;
export const selectConversationById = (
  state: InboxRootState,
  conversationId: string,
) => state.inbox.conversations[conversationId];
export const selectFocusedId = (state: InboxRootState) =>
  state.inbox.replyId ?? state.inbox.activeId;
export const selectActiveConversation = (state: InboxRootState) =>
  state.inbox.activeId
    ? state.inbox.conversations[state.inbox.activeId]
    : undefined;
export const selectReplyConversation = (state: InboxRootState) =>
  state.inbox.replyId
    ? state.inbox.conversations[state.inbox.replyId]
    : undefined;
export const selectPinnedConversation = (state: InboxRootState) =>
  state.inbox.pinnedId
    ? state.inbox.conversations[state.inbox.pinnedId]
    : undefined;
const emptyIds: string[] = [];
export const selectMessages = createSelector(
  [
    (state: InboxRootState, conversationId: string) =>
      state.inbox.histories[conversationId]?.ids ?? emptyIds,
    (state: InboxRootState) => state.inbox.messages,
  ],
  (ids, messages) => ids.map((id) => messages[id]).filter(Boolean),
);
export const selectProfile = (state: InboxRootState, conversationId: string) =>
  state.inbox.profiles[conversationId];
