import type { PayloadAction } from "@reduxjs/toolkit";
import type { ApiFailure } from "@/lib/api-response";
import type {
  ConnectionState,
  Conversation,
  InboxEvent,
  InboxMessage,
  Page,
  ReplyCapability,
} from "../types";
import {
  matchesConversationQuery,
  receiptKeys,
  rememberReceipt,
} from "./event-state";
import {
  mergeConversation,
  mergeMessage,
  orderMessages,
} from "./read-reducers";
import { emptyLoad, type InboxState } from "./state";

export const eventReducers = {
  connectionChanged(state: InboxState, action: PayloadAction<ConnectionState>) {
    state.connection = action.payload;
  },
  conversationsReconciled(
    state: InboxState,
    action: PayloadAction<Page<Conversation>>,
  ) {
    const page = action.payload;
    for (const conversation of page.items)
      mergeConversation(state, conversation);
    state.queue.ids = [
      ...new Set([...state.queue.ids, ...page.items.map((item) => item.id)]),
    ].filter((id) =>
      matchesConversationQuery(state.conversations[id], state.queue.query),
    );
    state.queue.hasLoaded = true;
    state.queue.status = "ready";
    state.queue.error = null;
    state.queue.nextCursor = page.nextCursor;
    state.queue.total = page.total ?? state.queue.total;
  },
  historyReconciled(
    state: InboxState,
    action: PayloadAction<{
      conversationId: string;
      page: Page<InboxMessage>;
      preserveCursor: boolean;
    }>,
  ) {
    const { conversationId, page, preserveCursor } = action.payload;
    if (!state.conversations[conversationId]) return;
    state.histories[conversationId] ??= {
      ...emptyLoad(),
      ids: [],
    };
    const history = state.histories[conversationId];
    const ids = page.items
      .filter((item) => item.conversationId === conversationId)
      .map((message) => mergeMessage(state, message));
    history.ids = orderMessages(state, [...history.ids, ...ids]);
    history.status = "ready";
    history.hasLoaded = true;
    history.error = null;
    if (!preserveCursor) history.nextCursor = page.nextCursor;
  },
  capabilityRefreshed(
    state: InboxState,
    action: PayloadAction<{
      conversationId: string;
      capability: ReplyCapability;
      expectedVersion: number;
      expectedCapabilityVersion: number | null;
    }>,
  ) {
    const {
      conversationId,
      capability,
      expectedVersion,
      expectedCapabilityVersion,
    } = action.payload;
    const conversation = state.conversations[conversationId];
    if (
      !conversation ||
      conversation.version !== expectedVersion ||
      (state.events.capabilities[conversationId]?.version ?? null) !==
        expectedCapabilityVersion
    )
      return;
    conversation.capability = capability;
    state.events.capabilities[conversationId] = {
      version: Math.max(expectedVersion, expectedCapabilityVersion ?? 0),
      value: capability,
    };
  },
  readStarted(
    state: InboxState,
    action: PayloadAction<{ conversationId: string; throughSequence: number }>,
  ) {
    state.events.readingThrough[action.payload.conversationId] =
      action.payload.throughSequence;
  },
  readConfirmed(
    state: InboxState,
    action: PayloadAction<{
      conversation: Conversation;
      throughSequence: number;
    }>,
  ) {
    const { conversation, throughSequence } = action.payload;
    if (!state.conversations[conversation.id]) return;
    mergeConversation(state, conversation);
    state.events.readThrough[conversation.id] = Math.max(
      state.events.readThrough[conversation.id] ?? 0,
      throughSequence,
    );
    delete state.events.readingThrough[conversation.id];
  },
  readFailed(
    state: InboxState,
    action: PayloadAction<{ conversationId: string; error: ApiFailure }>,
  ) {
    delete state.events.readingThrough[action.payload.conversationId];
    state.notice = {
      kind: "information",
      message: action.payload.error.message,
    };
  },
  eventReceived(state: InboxState, action: PayloadAction<InboxEvent>) {
    const event = action.payload;
    if (
      event.context.agentId !== state.context.agentId ||
      event.context.workspaceId !== state.context.workspaceId ||
      state.events.seenIds.includes(event.id)
    )
      return;
    state.events.seenIds.push(event.id);
    if (state.events.seenIds.length > 2048) state.events.seenIds.shift();
    state.events.cursor = event.cursor;
    if (event.type === "conversation") {
      mergeConversation(state, event.conversation);
    }
    if (event.type === "message") {
      const message = event.message;
      if (state.events.removed[message.conversationId] !== undefined) return;
      const id = mergeMessage(state, message);
      state.histories[message.conversationId] ??= {
        ...emptyLoad(),
        ids: [],
      };
      const history = state.histories[message.conversationId];
      history.ids = orderMessages(state, [...history.ids, id]);
    }
    if (event.type === "receipt") {
      if (state.events.removed[event.conversationId] !== undefined) return;
      const keys = receiptKeys({
        id: event.messageId,
        clientRequestId: event.clientRequestId,
      });
      rememberReceipt(state.events, event.conversationId, keys, {
        version: event.version,
        delivery: event.delivery,
      });
      const message = Object.values(state.messages).find(
        (item) =>
          item.conversationId === event.conversationId &&
          receiptKeys(item).some((key) => keys.includes(key)),
      );
      if (message)
        mergeMessage(state, {
          ...message,
          id: event.messageId ?? message.id,
          clientRequestId: event.clientRequestId ?? message.clientRequestId,
        });
    }
    if (event.type === "capability") {
      const previous = state.events.capabilities[event.conversationId];
      const conversation = state.conversations[event.conversationId];
      if (
        state.events.removed[event.conversationId] !== undefined ||
        (previous && event.version <= previous.version) ||
        (conversation && event.version < conversation.version)
      )
        return;
      state.events.capabilities[event.conversationId] = {
        version: event.version,
        value: event.capability,
      };
      if (conversation) conversation.capability = event.capability;
    }
    if (event.type === "removed") {
      const id = event.conversationId;
      const newest = Math.max(
        state.conversations[id]?.version ?? -1,
        state.events.capabilities[id]?.version ?? -1,
        state.events.removed[id] ?? -1,
      );
      if (event.version < newest) return;
      state.events.removed[id] = event.version;
      const selected =
        state.activeId === id ||
        state.replyId === id ||
        state.pinnedId === id ||
        state.quickHistoryId === id;
      if (state.activeId === id) state.activeId = null;
      if (state.replyId === id) state.replyId = null;
      if (state.quickHistoryId === id) state.quickHistoryId = null;
      if (state.pinnedId === id) {
        state.pinnedId = null;
        state.pinCollapsed = false;
      }
      if (selected) {
        state.selectionRevision++;
        state.notice = {
          kind: "information",
          message: "这段会话已不可用，请选择其他会话继续接待。",
        };
      }
      state.queue.ids = state.queue.ids.filter((item) => item !== id);
      delete state.conversations[id];
      delete state.histories[id];
      delete state.profiles[id];
      delete state.profileEdits[id];
      delete state.starUpdates[id];
      delete state.ending[id];
      delete state.sendingByConversation[id];
      delete state.events.readingThrough[id];
      for (const message of Object.values(state.messages)) {
        if (message.conversationId !== id) continue;
        delete state.messages[message.id];
        delete state.submissions[message.id];
      }
      for (const attachment of Object.values(state.attachments))
        if (attachment.conversationId === id)
          delete state.attachments[attachment.id];
      const draft = state.drafts[id];
      if (draft?.attachmentIds.length) {
        draft.attachmentIds = [];
        draft.revision++;
      }
    }
  },
};
