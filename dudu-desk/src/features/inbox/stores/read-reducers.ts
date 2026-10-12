import type { PayloadAction } from "@reduxjs/toolkit";
import type { ApiFailure } from "@/lib/api-response";
import type { InboxMessage, Page, VisitorProfile } from "../types";
import { mergeMessage, mergeProfile, orderMessages } from "./live-merge";
import { emptyLoad, type InboxState } from "./state";

/**
 * Re-exported from the Live events merge kernel (live-merge.ts) so existing
 * import sites keep working; new code imports from live-merge.ts directly.
 */
export {
  mergeConversation,
  mergeMessage,
  mergeProfile,
  orderMessages,
} from "./live-merge";

export const readReducers = {
  conversationSelected(
    state: InboxState,
    action: PayloadAction<string | null>,
  ) {
    state.activeId = action.payload;
    state.replyId = action.payload;
    state.selectionRevision++;
    state.notice = null;
  },
  historyLoading(state: InboxState, action: PayloadAction<string>) {
    const id = action.payload;
    state.histories[id] ??= { ...emptyLoad(), ids: [] };
    state.histories[id].status = "loading";
    state.histories[id].error = null;
    delete state.histories[id].failedRead;
  },
  historyCancelled(state: InboxState, action: PayloadAction<string>) {
    const history = state.histories[action.payload];
    if (history?.status !== "loading") return;
    history.status = history.hasLoaded ? "ready" : "idle";
    history.error = null;
  },
  historyLoaded(
    state: InboxState,
    action: PayloadAction<{ conversationId: string; page: Page<InboxMessage> }>,
  ) {
    const { conversationId, page } = action.payload;
    const history = state.histories[conversationId];
    const ids = page.items
      .filter((message) => message.conversationId === conversationId)
      .map((message) => mergeMessage(state, message));
    history.ids = orderMessages(state, [...history.ids, ...ids]);
    history.status = "ready";
    history.hasLoaded = true;
    history.error = null;
    history.nextCursor = page.nextCursor;
  },
  historyFailed(
    state: InboxState,
    action: PayloadAction<{
      conversationId: string;
      error: ApiFailure;
      more: boolean;
    }>,
  ) {
    const { conversationId, error, more } = action.payload;
    const history = state.histories[conversationId];
    history.status = "error";
    history.error = error;
    history.failedRead = more ? "more" : "refresh";
  },
  profileLoading(state: InboxState, action: PayloadAction<string>) {
    const previous = state.profiles[action.payload];
    state.profiles[action.payload] = {
      ...previous,
      status: "loading",
      error: null,
    };
  },
  profileLoaded(state: InboxState, action: PayloadAction<VisitorProfile>) {
    mergeProfile(state, action.payload);
  },
  profileFailed(
    state: InboxState,
    action: PayloadAction<{ conversationId: string; error: ApiFailure }>,
  ) {
    const previous = state.profiles[action.payload.conversationId];
    state.profiles[action.payload.conversationId] = {
      ...previous,
      status: "error",
      error: action.payload.error,
    };
  },
  noticeChanged(state: InboxState, action: PayloadAction<string | null>) {
    state.notice = action.payload
      ? { kind: "information", message: action.payload }
      : null;
  },
};
