import { describe, expect, it } from "vitest";
import type { InboxApi } from "../api";
import type { InboxEvent, Page, ReplyCapability } from "../types";
import { reconnectInbox, startInboxUpdates } from "./events";
import { focusPane, openQuickHistory, pinConversation } from "./parallel";
import { loadConversations } from "./queue";
import {
  destroyInbox,
  loadHistory,
  markConversationRead,
  resetContext,
} from "./reading";
import { selectMessages, selectQueueConversations } from "./selectors";
import { editDraft } from "./sending";
import {
  deferred,
  firstConversation,
  incomingMessage,
  secondConversation,
  testStore,
} from "./test-support";

type Subscription = Parameters<InboxApi["subscribe"]>[0];

function conversationEvent(
  input: Subscription,
  id: string,
): Extract<InboxEvent, { type: "conversation" }> {
  return {
    type: "conversation",
    id,
    cursor: id,
    context: input.context,
    conversation: { ...firstConversation, version: 2 },
  };
}

describe("inbox connection recovery", () => {
  it("aborts and unsubscribes old streams, ignoring callbacks after restart, context reset and disposal", async () => {
    const subscriptions: Subscription[] = [];
    let disposed = 0;
    const store = testStore(
      {
        subscribe: (input) => {
          subscriptions.push(input);
          input.onConnection("connected");
          return () => {
            disposed++;
          };
        },
      },
      false,
    );
    store.dispatch(startInboxUpdates());
    await store.dispatch(loadConversations());
    store.dispatch(editDraft("conversation-a", "持续保留"));
    const first = subscriptions[0];
    first.onEvent(conversationEvent(first, "checkpoint"));
    store.dispatch(startInboxUpdates());
    expect(first.signal.aborted).toBe(true);
    expect(subscriptions[1].cursor).toBe("checkpoint");
    expect(disposed).toBe(1);
    first.onConnection("unavailable");
    first.onEvent({
      ...conversationEvent(first, "late"),
      conversation: {
        ...firstConversation,
        version: 10,
        preview: "旧连接消息",
      },
    });
    expect(store.getState().inbox.connection).toBe("connected");
    expect(
      store.getState().inbox.conversations["conversation-a"].preview,
    ).not.toBe("旧连接消息");
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe(
      "持续保留",
    );
    store.dispatch(
      resetContext({ agentId: "agent-new", workspaceId: "workspace-new" }),
    );
    subscriptions[1].onEvent(
      conversationEvent(subscriptions[1], "wrong-context"),
    );
    expect(subscriptions[1].signal.aborted).toBe(true);
    expect(store.getState().inbox.conversations).toEqual({});
    store.dispatch(startInboxUpdates());
    store.dispatch(destroyInbox());
    subscriptions[2].onConnection("connected");
    subscriptions[2].onEvent(
      conversationEvent(subscriptions[2], "after-disposal"),
    );
    expect(subscriptions[2].signal.aborted).toBe(true);
    expect(disposed).toBe(3);
    expect(store.getState().inbox.conversations).toEqual({});
  });

  it("compensates a reconnect across history pages and refreshes capabilities while retaining queue order and drafts", async () => {
    const subscriptions: Subscription[] = [];
    let queues = 0;
    let histories = 0;
    const capabilityIds: string[] = [];
    const store = testStore({
      subscribe: (input) => {
        subscriptions.push(input);
        input.onConnection("connected");
        return () => {};
      },
      listConversations: async () => ({
        items:
          queues++ === 0
            ? [firstConversation, secondConversation]
            : [
                { ...secondConversation, version: 2, unread: 3 },
                { ...firstConversation, version: 2, unread: 2 },
              ],
        nextCursor: null,
      }),
      listMessages: async ({ conversationId, cursor }) => {
        histories++;
        const first = incomingMessage(conversationId);
        if (histories === 1)
          return { items: [first], nextCursor: "older-history" };
        if (!cursor)
          return {
            items: [
              { ...first, id: "gap-4", sequence: 4 },
              { ...first, id: "gap-5", sequence: 5 },
            ],
            nextCursor: "recovery-gap",
          };
        return {
          items: [first, { ...first, id: "gap-3", sequence: 3 }],
          nextCursor: "older-history",
        };
      },
      getCapability: async ({ conversationId }) => {
        capabilityIds.push(conversationId);
        return {
          state: "restricted",
          kinds: [],
          reason: "连接恢复后权限已变更",
        };
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "断线期间的草稿"));
    subscriptions[0].onConnection("disconnected");
    expect(store.getState().inbox.connection).toBe("disconnected");
    expect(selectMessages(store.getState(), "conversation-a")).toHaveLength(1);
    await store.dispatch(reconnectInbox());
    expect(store.getState().inbox.connection).toBe("connected");
    expect(histories).toBe(3);
    expect(
      selectMessages(store.getState(), "conversation-a").map(
        (item) => item.sequence,
      ),
    ).toEqual([1, 3, 4, 5]);
    expect(store.getState().inbox.histories["conversation-a"].nextCursor).toBe(
      "older-history",
    );
    expect(
      selectQueueConversations(store.getState()).map((item) => item.id),
    ).toEqual(["conversation-a", "conversation-b"]);
    expect(capabilityIds.sort()).toEqual(["conversation-a", "conversation-b"]);
    expect(
      store.getState().inbox.conversations["conversation-a"].capability.state,
    ).toBe("restricted");
    expect(store.getState().inbox.replyId).toBe("conversation-a");
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe(
      "断线期间的草稿",
    );
  });

  it("clears removed selections and pins without retargeting, and rejects stale reads that would resurrect them", async () => {
    let input!: Subscription;
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(pinConversation("conversation-b"));
    store.dispatch(focusPane("pinned"));
    await store.dispatch(openQuickHistory("conversation-b"));
    input.onEvent({
      type: "removed",
      id: "removed-pin",
      cursor: "removed-pin",
      context: input.context,
      conversationId: "conversation-b",
      version: 3,
    });
    expect(store.getState().inbox.pinnedId).toBeNull();
    expect(store.getState().inbox.quickHistoryId).toBeNull();
    expect(store.getState().inbox.replyId).toBeNull();
    expect(store.getState().inbox.activeId).toBe("conversation-a");
    expect(store.getState().inbox.notice).toBeTruthy();
    input.onEvent({
      type: "removed",
      id: "removed-primary",
      cursor: "removed-primary",
      context: input.context,
      conversationId: "conversation-a",
      version: 3,
    });
    await store.dispatch(loadConversations());
    expect(selectQueueConversations(store.getState())).toEqual([]);
    expect(store.getState().inbox.activeId).toBeNull();
    expect(store.getState().inbox.replyId).toBeNull();
  });

  it("cancels in-flight conversation work when a removal invalidates its target", async () => {
    let input!: Subscription;
    let signal!: AbortSignal;
    const pending = deferred<typeof firstConversation>();
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      markRead: (request) => {
        signal = request.signal;
        return pending.promise;
      },
    });
    await store.dispatch(loadConversations());
    const reading = store.dispatch(markConversationRead("conversation-a", 1));
    input.onEvent({
      type: "removed",
      id: "removed-target",
      cursor: "removed-target",
      context: input.context,
      conversationId: "conversation-a",
      version: 3,
    });
    expect(signal.aborted).toBe(true);
    pending.resolve({ ...firstConversation, version: 100, unread: 0 });
    await reading;
    expect(
      store.getState().inbox.conversations["conversation-a"],
    ).toBeUndefined();
    expect(store.getState().inbox.replyId).toBeNull();
  });

  it("keeps capability events newer than an in-flight unversioned capability refresh", async () => {
    let input!: Subscription;
    const pending = deferred<ReplyCapability>();
    const started = deferred<void>();
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      getCapability: async ({ conversationId }) => {
        if (conversationId !== "conversation-a")
          return { state: "allowed", kinds: ["text"] };
        started.resolve();
        return pending.promise;
      },
    });
    await store.dispatch(loadConversations());
    input.onConnection("disconnected");
    const recovering = store.dispatch(reconnectInbox());
    await started.promise;
    expect(store.getState().inbox.connection).toBe("reconnecting");
    input.onEvent({
      type: "capability",
      id: "fresh-capability",
      cursor: "fresh-capability",
      context: input.context,
      conversationId: "conversation-a",
      version: 10,
      capability: { state: "restricted", kinds: [], reason: "最新能力事件" },
    });
    pending.resolve({ state: "allowed", kinds: ["text"] });
    await recovering;
    expect(
      store.getState().inbox.conversations["conversation-a"].capability,
    ).toMatchObject({ state: "restricted", reason: "最新能力事件" });
  });

  it("cancels compensation and ignores its late results after switching work context", async () => {
    let input!: Subscription;
    let signal!: AbortSignal;
    let calls = 0;
    const pending = deferred<Page<typeof firstConversation>>();
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      listConversations: async (request) => {
        if (calls++ === 0)
          return { items: [firstConversation], nextCursor: null };
        signal = request.signal;
        return pending.promise;
      },
    });
    await store.dispatch(loadConversations());
    input.onConnection("disconnected");
    const recovering = store.dispatch(reconnectInbox());
    store.dispatch(
      resetContext({ agentId: "another", workspaceId: "another-workspace" }),
    );
    expect(signal.aborted).toBe(true);
    pending.resolve({
      items: [{ ...firstConversation, version: 100 }],
      nextCursor: null,
    });
    await recovering;
    expect(store.getState().inbox.conversations).toEqual({});
    expect(store.getState().inbox.connection).toBe("connecting");
  });

  it("retains every compensated queue page when a manual refresh finishes between pages", async () => {
    let input!: Subscription;
    let firstPages = 0;
    const tail = deferred<Page<typeof firstConversation>>();
    const tailStarted = deferred<void>();
    const third = { ...firstConversation, id: "conversation-c" };
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      listConversations: async ({ cursor }) => {
        if (cursor === "tail") {
          tailStarted.resolve();
          return tail.promise;
        }
        firstPages++;
        if (firstPages === 2)
          return { items: [secondConversation], nextCursor: "tail" };
        return {
          items: [firstConversation],
          nextCursor: firstPages === 1 ? null : "manual-older",
        };
      },
      getCapability: async () => ({ state: "allowed", kinds: ["text"] }),
    });
    await store.dispatch(loadConversations());
    input.onConnection("disconnected");
    const recovering = store.dispatch(reconnectInbox());
    await tailStarted.promise;
    await store.dispatch(loadConversations());
    tail.resolve({ items: [third], nextCursor: null });
    await recovering;
    expect(
      selectQueueConversations(store.getState()).map((item) => item.id),
    ).toEqual(["conversation-a", "conversation-b", "conversation-c"]);
  });
});
