import type { PayloadAction } from "@reduxjs/toolkit";
import type { ApiFailure } from "@/lib/api-response";
import { matchesConversationFilters } from "../conversation-query";
import type {
  Conversation,
  ConversationPage,
  ConversationQuery,
} from "../types";
import { mergeConversation } from "./read-reducers";
import { emptyLoad, type InboxState } from "./state";

/**
 * Conversation queue reducers: own queue membership, cursors and counts.
 * Entity merging stays in read-reducers.ts; recovery fan-out stays in
 * event-reducers.ts; both write through mergeConversation.
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
    const ids = page.items.map((item) => item.id);
    const retained = new Set([...ids, ...preserveIds]);
    for (const conversation of page.items)
      mergeConversation(state, conversation);
    state.queue.ids = [
      ...new Set([
        ...previousIds.filter((id) => append || retained.has(id)),
        ...ids,
      ]),
    ].filter(
      (id) =>
        !!state.conversations[id] &&
        matchesConversationFilters(state.conversations[id], state.queue.query),
    );
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
