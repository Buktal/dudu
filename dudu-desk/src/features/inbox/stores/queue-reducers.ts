import type { PayloadAction } from "@reduxjs/toolkit";
import type { ApiFailure } from "@/lib/api-response";
import type {
  Conversation,
  ConversationPage,
  ConversationQuery,
} from "../types";
import { mergeConversation } from "./live-merge";
import { rewriteQueueIds } from "./queue-membership";
import { emptyLoad, type InboxState } from "./state";

/**
 * Conversation queue reducers: own queue membership, cursors and counts.
 * Entity merging stays in the Live events merge kernel; the keep rules for a
 * rewrite stay in the queue membership module.
 */
export const queueReducers = {
  conversationsDiscovered(
    state: InboxState,
    action: PayloadAction<Conversation[]>,
  ) {
    for (const conversation of action.payload)
      mergeConversation(state, conversation, false);
  },
  queueLoading(
    state: InboxState,
    action: PayloadAction<ConversationQuery | undefined>,
  ) {
    if (action.payload) {
      state.queue = {
        ...emptyLoad(),
        ids: [],
        query: action.payload,
        counts: state.queue.counts,
        channels: state.queue.channels,
      };
    }
    state.queue.status = "loading";
    state.queue.error = null;
    delete state.queue.failedRead;
  },
  queueLoaded(
    state: InboxState,
    action: PayloadAction<{
      page: ConversationPage;
      append: boolean;
      preserveIds: string[];
    }>,
  ) {
    const { page, append, preserveIds } = action.payload;
    const previousIds = [...state.queue.ids];
    for (const conversation of page.items)
      mergeConversation(state, conversation);
    state.queue.ids = rewriteQueueIds({
      conversations: state.conversations,
      query: state.queue.query,
      previousIds,
      incomingIds: page.items.map((item) => item.id),
      mode: append ? "append" : "refresh",
      preserveIds,
    });
    state.queue.status = "ready";
    state.queue.hasLoaded = true;
    state.queue.nextCursor = page.nextCursor;
    state.queue.total = page.total;
    state.queue.counts = page.counts ?? state.queue.counts;
    state.queue.channels = page.channels ?? state.queue.channels;
    state.queue.error = null;
  },
  queueFailed(
    state: InboxState,
    action: PayloadAction<{ error: ApiFailure; more: boolean }>,
  ) {
    const { error, more } = action.payload;
    state.queue.status = "error";
    state.queue.error = error;
    state.queue.failedRead = more ? "more" : "refresh";
    if (error.kind === "unavailable") state.connection = "unavailable";
    if (error.kind === "network" || error.kind === "authentication")
      state.connection = "disconnected";
  },
};
