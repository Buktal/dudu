import type { PayloadAction } from "@reduxjs/toolkit";
import type { ApiFailure } from "@/lib/api-response";
import type { ConnectionState, Conversation, InboxEvent } from "../types";
import {
  detachConversation,
  holdsMessages,
  mergeConversation,
  mergeMessage,
  mergeProfile,
  orderMessages,
} from "./live-merge";
import { receiptKeys, rememberReceipt } from "./receipts";
import { emptyLoad, type InboxState } from "./state";

export const eventReducers = {
  connectionChanged(state: InboxState, action: PayloadAction<ConnectionState>) {
    state.connection = action.payload;
  },
  /** 本地待处理提醒：0 表示清除；增减规则见 reminders.ts，由事件链路调用 */
  reminderChanged(
    state: InboxState,
    action: PayloadAction<{ conversationId: string; unread: number }>,
  ) {
    const { conversationId, unread } = action.payload;
    if (unread > 0) state.reminders[conversationId] = unread;
    else delete state.reminders[conversationId];
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
  /**
   * 真实链路没有服务端已读接口：读到最新处只清除本地待处理提醒并记录进度，
   * 不产生请求、不改变会话数据。
   */
  readHandledLocally(
    state: InboxState,
    action: PayloadAction<{ conversationId: string; throughSequence: number }>,
  ) {
    const { conversationId, throughSequence } = action.payload;
    delete state.reminders[conversationId];
    state.events.readThrough[conversationId] = Math.max(
      state.events.readThrough[conversationId] ?? 0,
      throughSequence,
    );
  },
  eventReceived(state: InboxState, action: PayloadAction<InboxEvent>) {
    const event = action.payload;
    if (
      event.context.agentId !== state.context.agentId ||
      event.context.workspaceId !== state.context.workspaceId
    )
      return;
    // 真实 Socket 报文没有 eventId 与游标；字段保留用于既有事件合并的去重与关联，存在时才处理
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
      // 本条消息引起的访客更新可与消息同帧下发；未携带时由独立 conversation 事件合并
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
    if (event.type === "profile") {
      // 渠道资料或共享标签/备注保存后：查看界面即时刷新，编辑草稿留在 profileEdits 不受影响
      mergeProfile(state, event.profile);
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
