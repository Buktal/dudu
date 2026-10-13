import { describe, expect, it } from "vitest";
import type { InboxApi } from "../api";
import { defineProfile } from "../test-fixtures";
import type { InboxEvent, Page } from "../types";
import { reconnectInbox, startInboxUpdates } from "./events";
import { focusPane, openQuickHistory, pinConversation } from "./parallel";
import { loadConversations } from "./queue";
import {
  destroyInbox,
  loadHistory,
  loadProfile,
  markConversationRead,
  resetContext,
  selectConversation,
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

  it("reloads the queue and the displayed recent page while retaining queue order and drafts", async () => {
    const subscriptions: Subscription[] = [];
    let queues = 0;
    let histories = 0;
    const profileIds: string[] = [];
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
                {
                  ...secondConversation,
                  version: 2,
                  unread: 0,
                  preview: "重连后的摘要",
                },
                {
                  ...firstConversation,
                  version: 2,
                  unread: 0,
                  capability: {
                    state: "restricted",
                    kinds: [],
                    reason: "连接恢复后权限已变更",
                  },
                },
              ],
        nextCursor: null,
      }),
      // 断线期间对方连发两条：重取最近页应显示它们，而不是补回旧缓存
      listMessages: async ({ conversationId, cursor }) => {
        histories++;
        expect(cursor).toBeUndefined();
        const first = incomingMessage(conversationId);
        if (histories === 1)
          return { items: [first], nextCursor: "older-history" };
        return {
          items: [
            { ...first, id: "gap-4", sequence: 4 },
            { ...first, id: "gap-5", sequence: 5 },
          ],
          nextCursor: "recovery-gap",
        };
      },
      readProfile: async ({ conversationId }) => {
        profileIds.push(conversationId);
        return defineProfile({ conversationId });
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    await store.dispatch(loadProfile("conversation-a"));
    store.dispatch(editDraft("conversation-a", "断线期间的草稿"));
    subscriptions[0].onConnection("disconnected");
    expect(store.getState().inbox.connection).toBe("disconnected");
    expect(selectMessages(store.getState(), "conversation-a")).toHaveLength(1);
    await store.dispatch(reconnectInbox());
    expect(store.getState().inbox.connection).toBe("connected");
    // 最近页重取一次；旧缓存的更早消息不与新页拼接
    expect(histories).toBe(2);
    expect(
      selectMessages(store.getState(), "conversation-a").map(
        (item) => item.sequence,
      ),
    ).toEqual([4, 5]);
    expect(store.getState().inbox.histories["conversation-a"].nextCursor).toBe(
      "recovery-gap",
    );
    // 列表按新范围重读但保持原有顺序；重读的摘要覆盖旧摘要
    expect(
      selectQueueConversations(store.getState()).map((item) => item.id),
    ).toEqual(["conversation-a", "conversation-b"]);
    expect(store.getState().inbox.conversations["conversation-b"].preview).toBe(
      "重连后的摘要",
    );
    // 名片与能力取重查结果：显示中的访客重查名片
    expect(profileIds).toEqual(["conversation-a", "conversation-a"]);
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

  it("keeps a live capability event newer than the reloaded conversation", async () => {
    let input!: Subscription;
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
    });
    await store.dispatch(loadConversations());
    input.onConnection("disconnected");
    const recovering = store.dispatch(reconnectInbox());
    input.onEvent({
      type: "capability",
      id: "fresh-capability",
      cursor: "fresh-capability",
      context: input.context,
      conversationId: "conversation-a",
      version: 10,
      capability: { state: "restricted", kinds: [], reason: "最新能力事件" },
    });
    await recovering;
    // 重读的会话摘要版本更旧：能力事件不被重载结果倒退
    expect(
      store.getState().inbox.conversations["conversation-a"].capability,
    ).toMatchObject({ state: "restricted", reason: "最新能力事件" });
  });

  it("cancels an in-flight reload and ignores its late results after switching work context", async () => {
    let input!: Subscription;
    let signal!: AbortSignal;
    let calls = 0;
    const started = deferred<void>();
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
        started.resolve();
        return pending.promise;
      },
    });
    await store.dispatch(loadConversations());
    input.onConnection("disconnected");
    const recovering = store.dispatch(reconnectInbox());
    await started.promise;
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

  it("keeps a live message that arrives while the reload is in flight", async () => {
    let input!: Subscription;
    let lists = 0;
    const started = deferred<void>();
    const reloading = deferred<Page<typeof firstConversation>>();
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      listConversations: async () => {
        lists += 1;
        if (lists === 1)
          return { items: [firstConversation], nextCursor: null };
        started.resolve();
        return reloading.promise;
      },
      listMessages: async ({ conversationId }) => ({
        items: [
          {
            ...incomingMessage(conversationId),
            id: "live-during-reload",
            sequence: 12,
          },
        ],
        nextCursor: null,
      }),
    });
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation(firstConversation.id));

    input.onConnection("disconnected");
    const recovering = store.dispatch(reconnectInbox());
    await started.promise;
    // 重载在途时收到的实时报文：摘要与已显示的消息集合照常合并
    input.onEvent({
      type: "message",
      context: input.context,
      message: {
        ...incomingMessage(firstConversation.id),
        id: "live-during-reload",
        sequence: 12,
      },
      conversation: {
        ...firstConversation,
        version: 5,
        preview: "重连期间的来信",
      },
    });
    reloading.resolve({
      items: [{ ...firstConversation, version: 0, preview: "重载快照" }],
      nextCursor: null,
    });
    await recovering;

    expect(
      store.getState().inbox.conversations[firstConversation.id].preview,
    ).toBe("重连期间的来信");
    expect(
      selectMessages(store.getState(), firstConversation.id).map(
        ({ id }) => id,
      ),
    ).toEqual(["live-during-reload"]);
  });
});
