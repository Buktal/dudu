import type { PayloadAction } from "@reduxjs/toolkit";
import type { ConnectionState, InboxEvent } from "../types";
import {
  holdsMessages,
  mergeConversation,
  mergeMessage,
  mergeProfile,
  orderMessages,
} from "./live-merge";
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
  /**
   * 真实链路没有服务端已读接口：读到最新处只清除本地待处理提醒，
   * 不产生请求、不改变会话数据，断线时同样成立。
   */
  readHandledLocally(
    state: InboxState,
    action: PayloadAction<{ conversationId: string }>,
  ) {
    delete state.reminders[action.payload.conversationId];
  },
  eventReceived(state: InboxState, action: PayloadAction<InboxEvent>) {
    const event = action.payload;
    if (
      event.context.agentId !== state.context.agentId ||
      event.context.workspaceId !== state.context.workspaceId
    )
      return;
    if (event.type === "conversation") {
      mergeConversation(state, event.conversation);
    }
    if (event.type === "message") {
      const message = event.message;
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
    if (event.type === "profile") {
      // 渠道资料或共享标签/备注保存后：查看界面即时刷新，编辑草稿留在 profileEdits 不受影响
      mergeProfile(state, event.profile);
    }
  },
};
