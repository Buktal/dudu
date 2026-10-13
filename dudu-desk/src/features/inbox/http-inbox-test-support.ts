import { DESK_SESSION_KEY } from "@/lib/desk-session";
import type { Conversation, InboxMessage } from "./types";

/**
 * http 接待适配器的测试夹具：真实 HTTP 边界各文件共用的来源、凭据种子、响应封装与
 * 独立于实现写出的服务端条目/消息（各文件按职责引用，不复制）。
 */
export const ORIGIN = "https://desk.example.test";
export const CONTEXT = { agentId: "agent-a", workspaceId: "workspace-a" };

export function signal() {
  return new AbortController().signal;
}

export function seed(token: string, origin = ORIGIN) {
  sessionStorage.setItem(DESK_SESSION_KEY, JSON.stringify({ origin, token }));
}

export function envelope(data: unknown) {
  return Response.json({ code: 0, msg: "操作成功", data });
}

// 独立于实现写出的服务端条目与期望会话
export const SERVER_ITEM = {
  id: "41",
  identity: {
    id: "41",
    externalUserId: "external-a",
    name: "林小满",
    channelId: "wechat-mp",
    channelName: "微信公众号",
    accountId: "51",
    accountName: "公众号",
  },
  status: "needs-reply",
  preview: "最后一条摘要",
  updatedAt: "2026-10-12 10:30:15",
  waitingSince: "2026-10-12 10:00:00",
  messageCount: 7,
  version: 3,
  capability: {
    state: "restricted",
    kinds: [],
    reason: "渠道发送能力尚未接入",
  },
};

export const EXPECTED_ITEM: Conversation = {
  id: "41",
  identity: {
    id: "41",
    externalUserId: "external-a",
    name: "林小满",
    avatarUrl: undefined,
    channelId: "wechat-mp",
    channelName: "微信公众号",
    accountId: "51",
    accountName: "公众号",
  },
  status: "needs-reply",
  unread: 0,
  preview: "最后一条摘要",
  updatedAt: "2026-10-12 10:30:15",
  waitingSince: "2026-10-12 10:00:00",
  messageCount: 7,
  version: 3,
  capability: {
    state: "restricted",
    kinds: [],
    reason: "渠道发送能力尚未接入",
    nextStep: undefined,
  },
};

// 独立于实现写出的服务端消息与期望消息
export const SERVER_INCOMING = {
  id: "9001",
  conversationId: "41",
  direction: "incoming",
  body: { type: "text", text: "还想问问保修" },
  createdAt: "2026-10-12 09:36:00",
  sequence: 36,
  version: 1,
};

export const SERVER_OUTGOING = {
  id: "9002",
  conversationId: "41",
  clientRequestId: "client-1",
  direction: "outgoing",
  body: { type: "text", text: "好的，已登记" },
  createdAt: "2026-10-12 09:40:00",
  sequence: 37,
  version: 2,
  senderUserId: "9",
  senderName: "林舟",
  delivery: { state: "sent" },
};

export const EXPECTED_INCOMING: InboxMessage = {
  id: "9001",
  conversationId: "41",
  direction: "incoming",
  body: { type: "text", text: "还想问问保修" },
  createdAt: "2026-10-12 09:36:00",
  sequence: 36,
  version: 1,
};

export const EXPECTED_OUTGOING: InboxMessage = {
  id: "9002",
  conversationId: "41",
  clientRequestId: "client-1",
  direction: "outgoing",
  body: { type: "text", text: "好的，已登记" },
  createdAt: "2026-10-12 09:40:00",
  sequence: 37,
  version: 2,
  senderUserId: "9",
  senderName: "林舟",
  delivery: { state: "sent" },
};

export function messageData(items: unknown[], nextCursor: string | null) {
  return { items, nextCursor };
}
