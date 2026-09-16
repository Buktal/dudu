import { describe, expect, it } from "vitest";
import type { InboxApi } from "../api";
import type { InboxEvent, InboxMessage, SendSubmission } from "../types";
import { markConversationRead, startInboxUpdates } from "./events";
import { loadConversations, loadHistory } from "./reading";
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
type EventData<T = InboxEvent> = T extends InboxEvent
  ? Omit<T, "id" | "cursor" | "context">
  : never;

function event(input: Subscription, data: EventData, id: string): InboxEvent {
  return { ...data, context: input.context, id, cursor: id };
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
    store.dispatch(editDraft("conversation-a", "正在输入"));
    const message = { ...incomingMessage("conversation-b"), version: 3 };
    const incoming = event(input, { type: "message", message }, "event-1");
    input.onEvent(incoming);
    input.onEvent(incoming);
    input.onEvent(
      event(
        input,
        {
          type: "message",
          message: {
            ...message,
            version: 1,
            body: { type: "text", text: "较早内容" },
          },
        },
        "event-2",
      ),
    );
    input.onEvent(
      event(
        input,
        {
          type: "conversation",
          conversation: {
            ...secondConversation,
            version: 2,
            unread: 2,
          },
        },
        "event-3",
      ),
    );
    input.onEvent({
      ...event(
        input,
        {
          type: "message",
          message: {
            ...message,
            id: "foreign-message",
          },
        },
        "foreign",
      ),
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
    expect(store.getState().inbox.conversations["conversation-b"].unread).toBe(
      2,
    );
  });

  it("keeps a receipt that arrives before the send response and correlates later server-only history", async () => {
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
    store.dispatch(editDraft("conversation-a", "等待真实回执"));
    const sending = store.dispatch(sendReply("conversation-a"));
    const accepted = acceptedMessage(submission);
    input.onEvent(
      event(
        input,
        {
          type: "receipt",
          conversationId: "conversation-a",
          messageId: accepted.id,
          clientRequestId: submission.clientRequestId,
          version: 4,
          delivery: { state: "read" },
        },
        "receipt-read",
      ),
    );
    expect(
      selectMessages(store.getState(), "conversation-a")[1].delivery?.state,
    ).toBe("read");
    pending.resolve(accepted);
    await sending;
    input.onEvent(
      event(
        input,
        {
          type: "message",
          message: {
            ...accepted,
            clientRequestId: undefined,
            version: 2,
            delivery: { state: "sent" },
          },
        },
        "server-message",
      ),
    );
    const messages = selectMessages(store.getState(), "conversation-a");
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      id: `client:${submission.clientRequestId}`,
      serverId: accepted.id,
      clientRequestId: submission.clientRequestId,
      delivery: { state: "read" },
    });
  });

  it("advances an unconfirmed submission from a later receipt without resending", async () => {
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
    store.dispatch(editDraft("conversation-a", "已提交的内容"));
    await store.dispatch(sendReply("conversation-a"));
    const pending = selectMessages(store.getState(), "conversation-a")[1];
    expect(pending.delivery?.state).toBe("unconfirmed");
    input.onEvent(
      event(
        input,
        {
          type: "receipt",
          conversationId: "conversation-a",
          clientRequestId: pending.clientRequestId,
          messageId: "confirmed-server-id",
          version: 2,
          delivery: { state: "delivered" },
        },
        "confirmed",
      ),
    );
    await store.dispatch(retryReply(pending.id));
    expect(
      selectMessages(store.getState(), "conversation-a")[1].delivery?.state,
    ).toBe("delivered");
    expect(store.getState().inbox.submissions[pending.id].status).toBe(
      "accepted",
    );
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe("");
    expect(store.getState().inbox.notice).toBeNull();
    expect(calls).toBe(1);
  });

  it("buffers a receipt until its unloaded message arrives, ignoring older receipts", async () => {
    let input!: Subscription;
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
    });
    await store.dispatch(loadConversations());
    input.onEvent(
      event(
        input,
        {
          type: "receipt",
          conversationId: "conversation-b",
          messageId: "unknown-yet",
          version: 4,
          delivery: { state: "read" },
        },
        "early-read",
      ),
    );
    input.onEvent(
      event(
        input,
        {
          type: "receipt",
          conversationId: "conversation-b",
          messageId: "unknown-yet",
          version: 2,
          delivery: { state: "accepted" },
        },
        "late-accepted",
      ),
    );
    input.onEvent(
      event(
        input,
        {
          type: "message",
          message: {
            ...incomingMessage("conversation-b"),
            id: "unknown-yet",
            direction: "outgoing",
            delivery: { state: "accepted" },
          },
        },
        "message-after-receipts",
      ),
    );
    expect(selectMessages(store.getState(), "conversation-b")).toHaveLength(1);
    expect(
      selectMessages(store.getState(), "conversation-b")[0].delivery?.state,
    ).toBe("read");
  });

  it("keeps newer capability evidence when older snapshots arrive", async () => {
    let input!: Subscription;
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
    });
    await store.dispatch(loadConversations());
    input.onEvent(
      event(
        input,
        {
          type: "capability",
          conversationId: "conversation-b",
          version: 4,
          capability: {
            state: "restricted",
            kinds: [],
            reason: "回复窗口已关闭",
          },
        },
        "restricted",
      ),
    );
    input.onEvent(
      event(
        input,
        {
          type: "capability",
          conversationId: "conversation-b",
          version: 2,
          capability: { state: "allowed", kinds: ["text"] },
        },
        "old-capability",
      ),
    );
    input.onEvent(
      event(
        input,
        {
          type: "conversation",
          conversation: {
            ...secondConversation,
            version: 3,
          },
        },
        "old-snapshot",
      ),
    );
    expect(
      store.getState().inbox.conversations["conversation-b"].capability,
    ).toMatchObject({ state: "restricted", reason: "回复窗口已关闭" });
  });

  it("confirms the visible read sequence independently from needs-reply status and active target", async () => {
    const reads: { conversationId: string; throughSequence: number }[] = [];
    const store = testStore({
      markRead: async (input) => {
        reads.push(input);
        return { ...secondConversation, unread: 0, version: 2 };
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-b"));
    await store.dispatch(markConversationRead("conversation-b", 1));
    await store.dispatch(markConversationRead("conversation-b", 1));
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatchObject({
      conversationId: "conversation-b",
      throughSequence: 1,
    });
    expect(
      store.getState().inbox.conversations["conversation-b"],
    ).toMatchObject({ status: "needs-reply", unread: 0 });
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
          starred: false,
          order: "wait",
        },
      }),
    );
    input.onEvent(
      event(
        input,
        {
          type: "conversation",
          conversation: {
            ...secondConversation,
            id: "other-channel",
            identity: {
              ...secondConversation.identity,
              channelId: "wechat-kf",
            },
          },
        },
        "other-channel",
      ),
    );
    input.onEvent(
      event(
        input,
        {
          type: "conversation",
          conversation: {
            ...secondConversation,
            id: "new-matching",
          },
        },
        "matching-channel",
      ),
    );
    expect(
      selectQueueConversations(store.getState()).map((item) => item.id),
    ).toEqual(["conversation-b", "new-matching"]);
    expect(store.getState().inbox.replyId).toBe("conversation-b");
  });
});
