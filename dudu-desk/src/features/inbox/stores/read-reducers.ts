import type { PayloadAction } from "@reduxjs/toolkit";
import type { ApiFailure } from "@/lib/api-response";
import { matchesConversationFilters } from "../conversation-query";
import type {
  Conversation,
  ConversationPage,
  ConversationQuery,
  InboxMessage,
  Page,
  VisitorProfile,
} from "../types";
import {
  emptyLoad,
  type InboxState,
  receiptKeys,
  rememberReceipt,
} from "./state";

export function mergeConversation(
  state: InboxState,
  conversation: Conversation,
  updateQueue = true,
) {
  const removed = state.events.removed[conversation.id];
  if (removed !== undefined && conversation.version <= removed) return;
  const previous = state.conversations[conversation.id];
  if (!previous || conversation.version > previous.version) {
    const capability = state.events.capabilities[conversation.id];
    state.conversations[conversation.id] = {
      ...conversation,
      capability:
        capability && capability.version >= conversation.version
          ? capability.value
          : conversation.capability,
    };
    if (removed !== undefined) delete state.events.removed[conversation.id];
  }
  if (!updateQueue) return;
  if (
    matchesConversationFilters(
      state.conversations[conversation.id],
      state.queue.query,
    )
  ) {
    if (
      !state.queue.query.search.trim() &&
      !state.queue.ids.includes(conversation.id)
    )
      state.queue.ids.push(conversation.id);
  } else {
    state.queue.ids = state.queue.ids.filter((id) => id !== conversation.id);
  }
}

export function mergeMessage(state: InboxState, message: InboxMessage): string {
  if (state.events.removed[message.conversationId] !== undefined) return "";
  const collision = state.messages[message.id];
  if (collision && collision.conversationId !== message.conversationId)
    return "";
  const keys = receiptKeys(message);
  const matches = Object.values(state.messages).filter(
    (item) =>
      item.conversationId === message.conversationId &&
      receiptKeys(item).some((key) => keys.includes(key)),
  );
  const correlated =
    matches.find((item) => state.submissions[item.id]) ?? matches[0];
  const id = correlated?.id ?? message.id;
  const previous = matches.reduce<InboxMessage | undefined>(
    (newest, item) =>
      !newest || item.version > newest.version ? item : newest,
    undefined,
  );
  const snapshot =
    !previous || message.version > previous.version ? message : previous;
  const serverId =
    message.serverId ??
    (message.id !== id ? message.id : undefined) ??
    previous?.serverId;
  const merged: InboxMessage = {
    ...snapshot,
    id,
    ...(serverId ? { serverId } : {}),
    clientRequestId:
      message.clientRequestId ??
      correlated?.clientRequestId ??
      previous?.clientRequestId,
  };
  const evidence = rememberReceipt(
    state.events,
    message.conversationId,
    [
      ...new Set([
        ...keys,
        ...receiptKeys(merged),
        ...matches.flatMap(receiptKeys),
      ]),
    ],
    message.delivery
      ? { version: message.version, delivery: message.delivery }
      : undefined,
  );
  if (evidence) merged.delivery = evidence.delivery;
  state.messages[id] = merged;
  const submission = state.submissions[id];
  const delivery = merged.delivery?.state;
  if (submission && delivery && delivery !== "sending") {
    submission.status =
      delivery === "failed" || delivery === "unconfirmed"
        ? delivery
        : "accepted";
    if (state.sendingByConversation[message.conversationId] === id)
      delete state.sendingByConversation[message.conversationId];
  }
  for (const duplicate of matches) {
    if (duplicate.id === id) continue;
    delete state.messages[duplicate.id];
    const history = state.histories[message.conversationId];
    if (history)
      history.ids = [
        ...new Set(
          history.ids.map((item) => (item === duplicate.id ? id : item)),
        ),
      ];
  }
  const history = state.histories[message.conversationId];
  if (history) history.ids = orderMessages(state, history.ids);
  return id;
}

export function orderMessages(state: InboxState, ids: string[]): string[] {
  return [...new Set(ids)]
    .filter((id) => state.messages[id])
    .sort((a, b) => {
      const first = state.messages[a];
      const second = state.messages[b];
      return (
        first.sequence - second.sequence ||
        first.createdAt.localeCompare(second.createdAt) ||
        a.localeCompare(b)
      );
    });
}

export const readReducers = {
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
    action: PayloadAction<{ conversationId: string; error: ApiFailure }>,
  ) {
    const history = state.histories[action.payload.conversationId];
    history.status = "error";
    history.error = action.payload.error;
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
    const previous = state.profiles[action.payload.conversationId]?.data;
    if (previous && previous.version > action.payload.version) {
      state.profiles[action.payload.conversationId].status = "ready";
      state.profiles[action.payload.conversationId].error = null;
      return;
    }
    state.profiles[action.payload.conversationId] = {
      data: action.payload,
      status: "ready",
      error: null,
    };
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
