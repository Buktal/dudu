import { describe, expect, it } from "vitest";
import type { InboxApi } from "../api";
import { defineProfile } from "../development/fixtures";
import type { InboxEvent, InboxMessage, Page } from "../types";
import { editVisitorProfile } from "./details";
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
import { editDraft, sendReply } from "./sending";
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

describe("reconnect re-initialization", () => {
  it("re-reads the visitor list first page with counts and re-queries identity, keeping reply and profile drafts", async () => {
    let input!: Subscription;
    let scopes = 0;
    const cursors: (string | undefined)[] = [];
    const store = testStore(
      {
        subscribe: (subscription) => {
          input = subscription;
          input.onConnection("connected");
          return () => {};
        },
        listConversations: async ({ cursor }) => {
          cursors.push(cursor);
          return cursors.length === 1
            ? {
                items: [firstConversation, secondConversation],
                nextCursor: null,
                total: 2,
              }
            : {
                items: [
                  {
                    ...firstConversation,
                    version: 2,
                    preview: "重连后的最新摘要",
                  },
                  { ...secondConversation, version: 2 },
                ],
                nextCursor: "page-two",
                total: 42,
                counts: { active: 2, needsReply: 2, waiting: 0, closed: 1 },
                channels: [{ id: "wechat-kf", name: "微信客服" }],
              };
        },
        readProfile: async ({ conversationId }) =>
          defineProfile({ conversationId, note: "服务端最新备注" }),
      },
      true,
      {
        refreshAccess: async () => {
          scopes += 1;
          return new Set(["account-a", "account-b"]);
        },
      },
    );
    await store.dispatch(loadConversations());
    store.dispatch(editDraft(firstConversation.id, "断线期间写的回复"));
    await store.dispatch(selectConversation(firstConversation.id));
    await store.dispatch(loadProfile(firstConversation.id));
    store.dispatch(
      editVisitorProfile(firstConversation.id, { note: "断线期间改的备注" }),
    );

    input.onConnection("disconnected");
    await store.dispatch(reconnectInbox());

    // 重连重新执行初始化查询：重查身份、重读第一页与计数
    expect(scopes).toBe(1);
    expect(cursors).toEqual([undefined, undefined]);
    expect(store.getState().inbox.queue).toMatchObject({
      nextCursor: "page-two",
      total: 42,
      counts: { active: 2, needsReply: 2, waiting: 0, closed: 1 },
      channels: [{ id: "wechat-kf", name: "微信客服" }],
    });
    expect(
      store.getState().inbox.conversations[firstConversation.id].preview,
    ).toBe("重连后的最新摘要");
    // 临时断线保留仍有权访客的回复草稿与名片编辑草稿
    expect(store.getState().inbox.drafts[firstConversation.id].text).toBe(
      "断线期间写的回复",
    );
    expect(store.getState().inbox.profileEdits[firstConversation.id].note).toBe(
      "断线期间改的备注",
    );
    expect(store.getState().inbox.connection).toBe("connected");
  });

  it("removes conversations outside the re-queried identity scope while keeping drafts of the rest", async () => {
    let input!: Subscription;
    let lists = 0;
    const store = testStore(
      {
        subscribe: (subscription) => {
          input = subscription;
          input.onConnection("connected");
          return () => {};
        },
        listConversations: async () =>
          lists++ === 0
            ? {
                items: [firstConversation, secondConversation],
                nextCursor: null,
              }
            : { items: [secondConversation], nextCursor: null },
      },
      true,
      // 断线期间员工被调出账号 a 的组：重连重查身份只返回账号 b
      { refreshAccess: async () => new Set(["account-b"]) },
    );
    await store.dispatch(loadConversations());
    store.dispatch(editDraft(firstConversation.id, "无权会话的草稿"));
    store.dispatch(editDraft(secondConversation.id, "仍有权的草稿"));

    input.onConnection("disconnected");
    await store.dispatch(reconnectInbox());

    expect(
      selectQueueConversations(store.getState()).map(({ id }) => id),
    ).toEqual([secondConversation.id]);
    expect(
      store.getState().inbox.conversations[firstConversation.id],
    ).toBeUndefined();
    expect(store.getState().inbox.drafts[firstConversation.id]).toBeUndefined();
    expect(store.getState().inbox.drafts[secondConversation.id].text).toBe(
      "仍有权的草稿",
    );
  });

  it("invalidates cached histories and re-reads the displayed visitor's profile and recent page", async () => {
    let input!: Subscription;
    let round = 0;
    const historyReads: { conversationId: string; cursor?: string }[] = [];
    const profileReads: string[] = [];
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      listMessages: async ({ conversationId, cursor }) => {
        round += 1;
        historyReads.push({ conversationId, cursor });
        return {
          items: [
            {
              ...incomingMessage(conversationId),
              id: `msg-${round}`,
              sequence: round,
            },
          ],
          nextCursor: `older-${round}`,
        };
      },
      readProfile: async ({ conversationId }) => {
        profileReads.push(conversationId);
        return defineProfile({ conversationId });
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation(firstConversation.id));
    await store.dispatch(selectConversation(secondConversation.id));
    // 切回显示中访客复用缓存，不重新读取
    await store.dispatch(selectConversation(firstConversation.id));
    const readsBefore = historyReads.length;
    const profilesBefore = profileReads.length;
    expect(readsBefore).toBe(2);

    input.onConnection("disconnected");
    await store.dispatch(reconnectInbox());

    // 显示中的访客重取最近页：不带旧游标，旧缓存被替换而不是与新页拼接
    expect(historyReads.slice(readsBefore)).toEqual([
      { conversationId: firstConversation.id, cursor: undefined },
    ]);
    expect(
      selectMessages(store.getState(), firstConversation.id).map(
        ({ id }) => id,
      ),
    ).toEqual(["msg-3"]);
    // 更早消息的游标来自重取的最近页
    expect(
      store.getState().inbox.histories[firstConversation.id].nextCursor,
    ).toBe("older-3");
    // 名片重查只针对显示中的访客
    expect(profileReads.slice(profilesBefore)).toEqual([firstConversation.id]);
    // 其他访客的旧历史失效：切回时按需重取最近页
    expect(
      store.getState().inbox.histories[secondConversation.id],
    ).toMatchObject({ hasLoaded: false, ids: [] });
    const beforeSwitch = historyReads.length;
    await store.dispatch(selectConversation(secondConversation.id));
    expect(historyReads.slice(beforeSwitch)).toEqual([
      { conversationId: secondConversation.id, cursor: undefined },
    ]);
    // 更早消息仍通过向上分页读取
    await store.dispatch(loadHistory(firstConversation.id, true));
    expect(historyReads[historyReads.length - 1]).toEqual({
      conversationId: firstConversation.id,
      cursor: "older-3",
    });
  });

  it("ignores a pre-drop history read that resolves after the reconnect started", async () => {
    let input!: Subscription;
    let reads = 0;
    const started = deferred<void>();
    const stale = deferred<Page<InboxMessage>>();
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      listMessages: async ({ conversationId }) => {
        reads += 1;
        if (reads === 1) {
          started.resolve();
          return stale.promise;
        }
        return {
          items: [
            {
              ...incomingMessage(conversationId),
              id: "fresh-recent",
              sequence: 9,
            },
          ],
          nextCursor: null,
        };
      },
    });
    await store.dispatch(loadConversations());
    const displaying = store.dispatch(selectConversation(firstConversation.id));
    await started.promise;

    // 断线前发起的最近页读取：重连开始后被取消，迟到的结果不写回
    input.onConnection("disconnected");
    const recovering = store.dispatch(reconnectInbox());
    stale.resolve({
      items: [
        {
          ...incomingMessage(firstConversation.id),
          id: "stale-recent",
          sequence: 8,
        },
      ],
      nextCursor: "stale-cursor",
    });
    await displaying;
    await recovering;

    expect(
      selectMessages(store.getState(), firstConversation.id).map(
        ({ id }) => id,
      ),
    ).toEqual(["fresh-recent"]);
    // 迟到的旧结果连消息实体都不合并
    expect(store.getState().inbox.messages["stale-recent"]).toBeUndefined();
    expect(
      store.getState().inbox.histories[firstConversation.id].nextCursor,
    ).toBeNull();
  });

  it("keeps a profile edit draft across a reconnect and re-reads the newer server profile for the overwrite prompt", async () => {
    let input!: Subscription;
    let profiles = 0;
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      readProfile: async ({ conversationId }) => {
        profiles += 1;
        return defineProfile({
          conversationId,
          version: profiles === 1 ? 1 : 4,
          note: profiles === 1 ? "原备注" : "同事改过的备注",
        });
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadProfile(firstConversation.id));
    store.dispatch(
      editVisitorProfile(firstConversation.id, { note: "我的编辑" }),
    );

    input.onConnection("disconnected");
    await store.dispatch(reconnectInbox());

    // 重查的名片更新于编辑基线：草稿保留，保存前仍按现有覆盖提示处理
    expect(store.getState().inbox.profiles[firstConversation.id].data).toEqual(
      expect.objectContaining({ version: 4, note: "同事改过的备注" }),
    );
    expect(
      store.getState().inbox.profileEdits[firstConversation.id],
    ).toMatchObject({ note: "我的编辑", baseVersion: 1 });
  });

  it("settles an in-flight send from the reloaded page when its result was persisted", async () => {
    let input!: Subscription;
    let sent: { clientRequestId: string } | undefined;
    const pendingSend = deferred<InboxMessage>();
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      send: async (request) => {
        sent = { clientRequestId: request.clientRequestId };
        return pendingSend.promise;
      },
      listMessages: async ({ conversationId }) => {
        // 重连重取的最近页含服务端已保存的回复（发送接口尚未返回）
        const response = sent
          ? [
              {
                ...incomingMessage(conversationId),
                id: `server:${sent.clientRequestId}`,
                clientRequestId: sent.clientRequestId,
                direction: "outgoing" as const,
                body: { type: "text" as const, text: "请查一下" },
                sequence: 2,
                delivery: { state: "sent" as const },
              },
            ]
          : [];
        return { items: response, nextCursor: null };
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory(firstConversation.id));
    store.dispatch(editDraft(firstConversation.id, "请查一下"));
    const sending = store.dispatch(sendReply(firstConversation.id));
    // 发送中：时间线只有本地气泡
    expect(
      selectMessages(store.getState(), firstConversation.id).map(
        ({ delivery }) => delivery?.state,
      ),
    ).toEqual(["sending"]);

    input.onConnection("disconnected");
    await store.dispatch(reconnectInbox());

    // 结果直接取重查结果：提交按服务端已保存的消息落定，草稿消费，气泡不重复
    expect(
      Object.values(store.getState().inbox.submissions).map(
        ({ status }) => status,
      ),
    ).toEqual(["accepted"]);
    expect(store.getState().inbox.drafts[firstConversation.id].text).toBe("");
    expect(
      selectMessages(store.getState(), firstConversation.id).map(
        ({ delivery }) => delivery?.state,
      ),
    ).toEqual(["sent"]);
    pendingSend.resolve({
      ...incomingMessage(firstConversation.id),
      id: `server:${sent?.clientRequestId}`,
      direction: "outgoing",
      sequence: 2,
      delivery: { state: "sent" },
    });
    await sending;
  });

  it("reports reconnecting while the reload runs and connected once it settles", async () => {
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
    });
    await store.dispatch(loadConversations());

    input.onConnection("disconnected");
    const recovering = store.dispatch(reconnectInbox());
    await started.promise;
    expect(store.getState().inbox.connection).toBe("reconnecting");

    reloading.resolve({ items: [firstConversation], nextCursor: null });
    await recovering;
    expect(store.getState().inbox.connection).toBe("connected");
  });

  it("reports the failure category when the reload cannot read the list", async () => {
    let input!: Subscription;
    let lists = 0;
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
        throw new TypeError("network lost");
      },
    });
    await store.dispatch(loadConversations());

    input.onConnection("disconnected");
    await store.dispatch(reconnectInbox());

    expect(store.getState().inbox.connection).toBe("disconnected");
    expect(store.getState().inbox.notice?.message).toBe(
      "暂时无法连接服务，请稍后重试",
    );
  });
});

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
