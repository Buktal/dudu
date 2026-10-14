import { describe, expect, it } from "vitest";
import type { InboxApi } from "../api";
import type { InboxEvent, InboxMessage, SendSubmission } from "../types";
import { startInboxUpdates } from "./events";
import { loadConversations } from "./queue";
import { loadHistory, markConversationRead } from "./reading";
import { selectMessages, selectQueueConversations } from "./selectors";
import { editDraft, retryReply, sendReply } from "./sending";
import {
  acceptedMessage,
  deferred,
  incomingMessage,
  secondConversation,
  testStore,
} from "./test-support";

type Subscription = Parameters<InboxApi["subscribe"]>[0];
// 分布式 Omit：交叉联合需逐变体去掉 context，直接 Omit 会塌成宽形状
type EventData = InboxEvent extends infer T
  ? T extends InboxEvent
    ? Omit<T, "context">
    : never
  : never;

function event(input: Subscription, data: EventData): InboxEvent {
  return { ...data, context: input.context };
}

describe("incremental inbox updates", () => {
  it("merges duplicate and older updates in place without moving the reply target or drafts", async () => {
    let input!: Subscription;
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
    });
    store.dispatch(startInboxUpdates());
    await store.dispatch(loadConversations());
    // 消息事件只落在已经打开（历史已加载或正在展示）的会话上
    await store.dispatch(loadHistory("conversation-b"));
    store.dispatch(editDraft("conversation-a", "正在输入"));
    const message = { ...incomingMessage("conversation-b"), version: 3 };
    const incoming = event(input, { type: "message", message });
    input.onEvent(incoming);
    input.onEvent(incoming);
    input.onEvent(
      event(input, {
        type: "message",
        message: {
          ...message,
          version: 1,
          body: { type: "text", text: "较早内容" },
        },
      }),
    );
    input.onEvent(
      event(input, {
        type: "conversation",
        conversation: { ...secondConversation, version: 2 },
      }),
    );
    input.onEvent({
      ...event(input, {
        type: "message",
        message: {
          ...message,
          id: "foreign-message",
        },
      }),
      context: {
        agentId: "another-agent",
        workspaceId: input.context.workspaceId,
      },
    });
    expect(selectMessages(store.getState(), "conversation-b")).toEqual([
      message,
    ]);
    expect(
      selectQueueConversations(store.getState()).map((item) => item.id),
    ).toEqual(["conversation-a", "conversation-b"]);
    expect(store.getState().inbox.replyId).toBe("conversation-a");
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe(
      "正在输入",
    );
    expect(store.getState().inbox.conversations["conversation-b"].version).toBe(
      2,
    );
  });

  it("keeps a delivery result that arrives before the send response and correlates later server-only history", async () => {
    let input!: Subscription;
    let submission!: SendSubmission;
    const pending = deferred<InboxMessage>();
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      send: (request) => {
        submission = request;
        return pending.promise;
      },
    });
    store.dispatch(startInboxUpdates());
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "等待真实回执"));
    const sending = store.dispatch(sendReply("conversation-a"));
    const accepted = acceptedMessage(submission);
    input.onEvent(
      event(input, {
        type: "message",
        message: { ...accepted, version: 4, delivery: { state: "sent" } },
      }),
    );
    expect(
      selectMessages(store.getState(), "conversation-a")[1].delivery?.state,
    ).toBe("sent");
    pending.resolve(accepted);
    await sending;
    input.onEvent(
      event(input, {
        type: "message",
        message: {
          ...accepted,
          clientRequestId: undefined,
          version: 2,
          delivery: { state: "sent" },
        },
      }),
    );
    const messages = selectMessages(store.getState(), "conversation-a");
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      id: `client:${submission.clientRequestId}`,
      serverId: accepted.id,
      clientRequestId: submission.clientRequestId,
      delivery: { state: "sent" },
    });
  });

  it("advances an unconfirmed submission from a later delivery result without resending", async () => {
    let input!: Subscription;
    let calls = 0;
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      send: async () => {
        calls++;
        throw new TypeError("response lost");
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "已提交的内容"));
    await store.dispatch(sendReply("conversation-a"));
    const pending = selectMessages(store.getState(), "conversation-a")[1];
    expect(pending.delivery?.state).toBe("unconfirmed");
    input.onEvent(
      event(input, {
        type: "message",
        message: {
          ...incomingMessage("conversation-a"),
          id: "confirmed-server-id",
          clientRequestId: pending.clientRequestId,
          direction: "outgoing",
          body: { type: "text", text: "已提交的内容" },
          sequence: 2,
          version: 2,
          delivery: { state: "sent" },
        },
      }),
    );
    await store.dispatch(retryReply(pending.id));
    expect(
      selectMessages(store.getState(), "conversation-a")[1].delivery?.state,
    ).toBe("sent");
    expect(store.getState().inbox.submissions[pending.id].status).toBe(
      "accepted",
    );
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe("");
    expect(store.getState().inbox.notice).toBeNull();
    expect(calls).toBe(1);
  });

  it("confirms the visible read sequence locally without a server call", async () => {
    let input!: Subscription;
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-b"));
    // 未在屏上的来访产生一条待处理提醒，读到最新处只做本地确认
    input.onEvent(
      event(input, {
        type: "message",
        message: {
          ...incomingMessage("conversation-b"),
          id: "b-1",
          sequence: 1,
        },
      }),
    );
    expect(store.getState().inbox.reminders["conversation-b"]).toBe(1);
    await store.dispatch(markConversationRead("conversation-b", 1));
    await store.dispatch(markConversationRead("conversation-b", 1));
    expect(store.getState().inbox.events.readThrough["conversation-b"]).toBe(1);
    expect(store.getState().inbox.reminders["conversation-b"]).toBeUndefined();
    expect(store.getState().inbox.replyId).toBe("conversation-a");
  });

  it("adds matching conversations at the end without leaking other channels into a filtered queue", async () => {
    let input!: Subscription;
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      listConversations: async () => ({
        items: [secondConversation],
        nextCursor: null,
      }),
    });
    await store.dispatch(
      loadConversations({
        query: {
          search: "",
          channelId: "telegram",
          status: "all",
          order: "wait",
        },
      }),
    );
    input.onEvent(
      event(input, {
        type: "conversation",
        conversation: {
          ...secondConversation,
          id: "other-channel",
          identity: {
            ...secondConversation.identity,
            channelId: "wechat-kf",
          },
        },
      }),
    );
    input.onEvent(
      event(input, {
        type: "conversation",
        conversation: {
          ...secondConversation,
          id: "new-matching",
        },
      }),
    );
    expect(
      selectQueueConversations(store.getState()).map((item) => item.id),
    ).toEqual(["conversation-b", "new-matching"]);
    expect(store.getState().inbox.replyId).toBe("conversation-b");
  });
});
