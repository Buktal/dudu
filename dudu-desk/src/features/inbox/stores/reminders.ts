import type { Conversation, InboxEvent, InboxMessage } from "../types";
import type { InboxState } from "./state";
import type { InboxRootState } from "./store";

/**
 * 待处理提醒（契约第 4 节）：服务端不返回个人已读，真实链路（api.localUnread）
 * 在本次运行的内存里维护提醒——收到来信且该访客不在屏幕上时提示；收到成功的
 * outgoing 结果，或本条消息把访客带到 waiting 时清除对应提示（别人处理后其他端
 * 同步消除，以服务端状态为准）。提醒只由实时来信产生，登录或重连的初始化数据
 * 不制造旧提示；退出重登由上下文重置清空。Mock 沿用自身可复现的未读数据。
 */
export function reminderChange(
  state: InboxState,
  event: InboxEvent,
): { conversationId: string; unread: number } | null {
  if (event.type !== "message") return null;
  const conversationId = event.message.conversationId;
  if (served(event)) return { conversationId, unread: 0 };
  if (event.message.direction !== "incoming") return null;
  if (onScreen(state, conversationId)) return null;
  return {
    conversationId,
    unread: (state.reminders[conversationId] ?? 0) + 1,
  };
}

/** 屏幕上的访客：专注选中、并排固定或卡片展开都算正在查看 */
function onScreen(state: InboxState, conversationId: string): boolean {
  return (
    state.activeId === conversationId ||
    state.pinnedId === conversationId ||
    state.quickHistoryId === conversationId
  );
}

// 已处理：成功的 outgoing 结果，或本条消息把访客带到 waiting；失败与发送中不算
function served(event: InboxEvent): boolean {
  if (event.type !== "message") return false;
  if (event.conversation?.status === "waiting") return true;
  const message: InboxMessage = event.message;
  return (
    message.direction === "outgoing" &&
    ["accepted", "sent", "delivered", "read"].includes(
      message.delivery?.state ?? "",
    )
  );
}

/** 会话角标：本地待处理提醒优先，Mock 的未读照旧 */
export function unreadBadge(
  state: InboxRootState,
  conversation: Conversation,
): number {
  return state.inbox.reminders[conversation.id] ?? conversation.unread;
}
