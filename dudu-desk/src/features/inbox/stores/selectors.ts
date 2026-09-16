import { createSelector } from "@reduxjs/toolkit";
import { compareConversations } from "../conversation-query";
import type { InboxRootState } from "./store";

export const selectInbox = (state: InboxRootState) => state.inbox;
export const selectQueue = (state: InboxRootState) => state.inbox.queue;
export const selectActiveConversation = (state: InboxRootState) =>
  state.inbox.activeId
    ? state.inbox.conversations[state.inbox.activeId]
    : undefined;
export const selectReplyConversation = (state: InboxRootState) =>
  state.inbox.replyId
    ? state.inbox.conversations[state.inbox.replyId]
    : undefined;
export const selectQuickQueueConversations = createSelector(
  [
    (state: InboxRootState) => state.inbox.queue.ids,
    (state: InboxRootState) => state.inbox.conversations,
  ],
  (ids, conversations) => ids.map((id) => conversations[id]).filter(Boolean),
);
export const selectQueueConversations = createSelector(
  [
    selectQuickQueueConversations,
    (state: InboxRootState) => state.inbox.queue.query.order,
  ],
  (conversations, order) =>
    [...conversations].sort(compareConversations(order)),
);
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
