import { type InboxApi, unavailableInboxApi } from "../api";
import {
  defineConversation,
  defineMessage,
  defineProfile,
  FIXTURE_NOW,
} from "../development/fixtures";
import type { Conversation, InboxMessage, SendSubmission } from "../types";
import { startInboxUpdates } from "./events";
import { createInboxStore, type InboxRuntime } from "./store";

/**
 * Test-world card: the paired conversations the store suites share. Litmus
 * (name, preview, unread) lives here — not in the shared kernel — so test
 * semantics never load the production-importable graph.
 */
export function defineTestConversation(
  input: Pick<Conversation, "id" | "identity"> & Partial<Conversation>,
): Conversation {
  return defineConversation({
    status: "needs-reply",
    unread: 1,
    preview: "你好，想问一下",
    ...input,
  });
}

export const firstConversation: Conversation = defineTestConversation({
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
  updatedAt: FIXTURE_NOW,
});
export const secondConversation: Conversation = defineTestConversation({
  // Same-name visitor as firstConversation on a different account; shared
  // litmus comes from defineTestConversation, not from editing both cards.
  id: "conversation-b",
  identity: {
    id: "visitor-b",
    externalUserId: "external-b",
    name: "林小满",
    channelId: "telegram",
    channelName: "Telegram",
    accountId: "account-b",
    accountName: "海外服务",
  },
  updatedAt: FIXTURE_NOW,
});

export function incomingMessage(conversationId: string): InboxMessage {
  return defineMessage({ id: `${conversationId}-message`, conversationId });
}

export function acceptedMessage(input: SendSubmission): InboxMessage {
  return defineMessage({
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
  });
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

export function testStore(
  api: Partial<InboxApi> = {},
  startUpdates = true,
  runtime: Pick<InboxRuntime, "refreshAccess"> = {},
) {
  const store = createInboxStore({
    context: { agentId: "agent-a", workspaceId: "workspace-a" },
    refreshAccess: runtime.refreshAccess,
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
      readProfile: async ({ conversationId }) =>
        defineProfile({ conversationId }),
      ...api,
    },
    now: () => "2026-09-16T00:01:00Z",
  });
  if (startUpdates) store.dispatch(startInboxUpdates());
  return store;
}
