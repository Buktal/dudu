import type { PayloadAction } from "@reduxjs/toolkit";
import type { ApiFailure } from "@/lib/api-response";
import type {
  ConnectionState,
  Conversation,
  ConversationPage,
  InboxEvent,
  InboxMessage,
  Page,
  ReplyCapability,
} from "../types";
import {
  detachConversation,
  holdsMessages,
  mergeConversation,
  mergeMessage,
  orderMessages,
} from "./live-merge";
import { applyQueuePageMeta, rewriteQueueIds } from "./queue-membership";
import { receiptKeys, rememberReceipt } from "./receipts";
import { emptyLoad, type InboxState } from "./state";

export const eventReducers = {
  connectionChanged(state: InboxState, action: PayloadAction<ConnectionState>) {
    state.connection = action.payload;
  },
  conversationsReconciled(
    state: InboxState,
    action: PayloadAction<ConversationPage>,
  ) {
    const page = action.payload;
    // Merge entities without touching queue membership: the reconcile rewrite
    // below owns ids, mirroring the queueLoaded transaction.
    for (const conversation of page.items)
      mergeConversation(state, conversation, false);
    state.queue.ids = rewriteQueueIds({
      conversations: state.conversations,
      query: state.queue.query,
      previousIds: state.queue.ids,
      incomingIds: page.items.map((item) => item.id),
      mode: "reconcile",
    });
    applyQueuePageMeta(state.queue, page, { fallbackTotal: true });
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
      event.context.workspaceId !== state.context.workspaceId
    )
      return;
    // 真实 Socket 报文没有 eventId 与游标，不做去重与续订游标维护；Mock 仍按自身字段生效
    if (event.id !== undefined) {
      if (state.events.seenIds.includes(event.id)) return;
      state.events.seenIds.push(event.id);
      if (state.events.seenIds.length > 2048) state.events.seenIds.shift();
    }
    if (event.cursor !== undefined) state.events.cursor = event.cursor;
    if (event.type === "conversation") {
      mergeConversation(state, event.conversation);
    }
    if (event.type === "message") {
      const message = event.message;
      if (state.events.removed[message.conversationId] !== undefined) return;
      // 本条消息引起的访客更新合并在 message 中（Mock 以独立 conversation 事件表达）
      if (event.conversation) mergeConversation(state, event.conversation);
      if (message.direction === "incoming") {
        state.events.incomingSequence[message.conversationId] = Math.max(
          state.events.incomingSequence[message.conversationId] ?? 0,
          message.sequence,
        );
      }
      // 未打开的访客只更新摘要与状态：不置 hasLoaded、不建消息集合，首次打开仍取最近页
      if (!holdsMessages(state, message.conversationId)) return;
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
      if (detachConversation(state, id)) {
        state.selectionRevision++;
        state.notice = {
          kind: "information",
          message: "这段会话已不可用，请选择其他会话继续接待。",
        };
      }
    }
  },
};
