import type { Conversation, InboxEvent, InboxMessage } from "../types";
import type { InboxState } from "./state";
import type { InboxRootState } from "./store";

/**
 * 待处理提醒（契约第 4 节）：服务端不返回个人已读，真实链路（api.localUnread）
 * 在本次运行的内存里维护提醒——收到来信且该访客不在屏幕上时提示；收到成功的
 * outgoing 结果、本条消息把访客带到 waiting，或 conversation 报文把共享状态带到
 * closed 时清除对应提示（别人处理后其他端同步消除，以最新服务端状态为准，较新的
 * 待回复状态不被较旧的结束报文误清）。提醒只由实时来信产生，登录或重连的初始化
 * 数据不制造旧提示——重连重查只按结果收敛（reminderSettlement）；退出重登由上下文
 * 重置清空。Mock 沿用自身可复现的未读数据。
 */
export type ReminderChange = { conversationId: string; unread: number };

export function reminderChange(
  state: InboxState,
  event: InboxEvent,
): ReminderChange | null {
  // conversation 报文（结束 / 继续）：按合并后的最新共享状态判定；较旧的结束报文
  // 已被 mergeConversation 挡下，此时最新状态仍是待回复，提醒保留
  if (event.type === "conversation") {
    const conversationId = event.conversation.id;
    const latest = state.conversations[conversationId] ?? event.conversation;
    return latest.status === "closed" &&
      (state.reminders[conversationId] ?? 0) > 0
      ? { conversationId, unread: 0 }
      : null;
  }
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

/**
 * 重连重查后的提醒收敛：重查结果已是等待中（别人已处理）或已结束（别人结束接待）的
 * 访客，本次运行的本地提醒随之清除；仍待回复的保留。重查本身不制造提醒——补回或
 * 重放的旧消息只更新摘要与消息集合，只有本次运行收到的实时来信才产生提醒。
 */
export function reminderSettlement(state: InboxState): ReminderChange[] {
  return Object.values(state.conversations)
    .filter(
      (conversation) =>
        ["waiting", "closed"].includes(conversation.status) &&
        (state.reminders[conversation.id] ?? 0) > 0,
    )
    .map((conversation) => ({ conversationId: conversation.id, unread: 0 }));
}

/** 屏幕上的访客：专注选中、并排固定或卡片展开都算正在查看 */
function onScreen(state: InboxState, conversationId: string): boolean {
  return (
    state.activeId === conversationId ||
    state.pinnedId === conversationId ||
    state.quickHistoryId === conversationId
  );
}

// 已处理：成功的 outgoing 结果，或本条消息把访客带到 waiting；失败与发送中不算。
// accepted/delivered/read 与 sending.ts 可确认词表中的 Mock 专属取值一致
// （真实解析边界只认 sending/sent/failed）
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
