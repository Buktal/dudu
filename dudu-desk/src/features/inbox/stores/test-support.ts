import { type InboxApi, unavailableInboxApi } from "../api";
import { defineConversation } from "../fixtures";
import type { Conversation, InboxMessage, SendSubmission } from "../types";
import { startInboxUpdates } from "./events";
import { createInboxStore } from "./store";

export const firstConversation: Conversation = defineConversation({
  id: "conversation-a",
  identity: {
    id: "visitor-a",
    externalUserId: "external-a",
    name: "林小满",
    channelId: "wechat-kf",
    channelName: "微信客服",
    accountId: "account-a",
    accountName: "品牌旗舰店",
  },
  status: "needs-reply",
  unread: 1,
  preview: "你好，想问一下",
  updatedAt: "2026-09-16T00:00:00Z",
});
export const secondConversation: Conversation = {
  ...firstConversation,
  id: "conversation-b",
  identity: {
    ...firstConversation.identity,
    id: "visitor-b",
    externalUserId: "external-b",
    channelId: "telegram",
    channelName: "Telegram",
    accountId: "account-b",
    accountName: "海外服务",
  },
};

export function incomingMessage(conversationId: string): InboxMessage {
  return {
    id: `${conversationId}-message`,
    conversationId,
    direction: "incoming",
    body: { type: "text", text: "请帮我确认一下" },
    createdAt: "2026-09-16T00:00:00Z",
    sequence: 1,
    version: 1,
  };
}

export function acceptedMessage(input: SendSubmission): InboxMessage {
  return {
    id: `server:${input.clientRequestId}`,
    clientRequestId: input.clientRequestId,
    conversationId: input.target.conversationId,
    direction: "outgoing",
    body: input.attachments.length
      ? { type: "reply", text: input.text, attachments: input.attachments }
      : { type: "text", text: input.text },
    createdAt: "2026-09-16T00:01:00Z",
    sequence: 2,
    version: 1,
    delivery: { state: "accepted" },
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

export function testStore(api: Partial<InboxApi> = {}, startUpdates = true) {
  const store = createInboxStore({
    context: { agentId: "agent-a", workspaceId: "workspace-a" },
    api: {
      ...unavailableInboxApi,
      subscribe: ({ onConnection }) => {
        onConnection("connected");
        return () => {};
      },
      listConversations: async () => ({
        items: [firstConversation, secondConversation],
        nextCursor: null,
        total: 2,
      }),
      listMessages: async ({ conversationId }) => ({
        items: [incomingMessage(conversationId)],
        nextCursor: null,
      }),
      readProfile: async ({ conversationId }) => ({
        conversationId,
        version: 1,
        fields: [],
        tags: [],
        note: "",
      }),
      ...api,
    },
    now: () => "2026-09-16T00:01:00Z",
  });
  if (startUpdates) store.dispatch(startInboxUpdates());
  return store;
}
