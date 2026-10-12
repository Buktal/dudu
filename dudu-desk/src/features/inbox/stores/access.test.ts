import { describe, expect, it } from "vitest";
import type { InboxApi } from "../api";
import { defineProfile } from "../development/fixtures";
import type { ConversationPage, InboxEvent } from "../types";
import { startInboxUpdates } from "./events";
import { pinConversation } from "./parallel";
import { loadConversations } from "./queue";
import { destroyInbox, loadHistory, loadProfile } from "./reading";
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

function accessChanged(input: Subscription): InboxEvent {
  return { type: "access-changed", context: input.context };
}

/** 冲掉 thunk 链上的微任务与宏任务，供订阅推送后的断言使用。 */
async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("access changes", () => {
  it("re-queries identity and list, drops unauthorized caches and keeps the rest", async () => {
    const subscriptions: Subscription[] = [];
    let allowed = new Set(["account-a", "account-b"]);
    let refreshes = 0;
    let released = 0;
    const store = testStore(
      {
        localUnread: true,
        subscribe: (subscription) => {
          subscriptions.push(subscription);
          subscription.onConnection("connected");
          return () => {
            released++;
          };
        },
        listConversations: async () => {
          const items = [firstConversation, secondConversation].filter(
            (conversation) => allowed.has(conversation.identity.accountId),
          );
          return { items, nextCursor: null, total: items.length };
        },
        readProfile: async ({ conversationId }) =>
          defineProfile({ conversationId, tags: [`标签-${conversationId}`] }),
      },
      true,
      {
        refreshAccess: async () => {
          refreshes++;
          return allowed;
        },
      },
    );
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    await store.dispatch(loadHistory("conversation-b"));
    await store.dispatch(loadProfile("conversation-b"));
    store.dispatch(editDraft("conversation-a", "保留草稿"));
    store.dispatch(editDraft("conversation-b", "无权草稿"));
    // 未在屏幕上的来访提醒：先收到 conversation-b 的来信，再固定它
    subscriptions[0].onEvent({
      type: "message",
      context: subscriptions[0].context,
      message: incomingMessage("conversation-b"),
    });
    await store.dispatch(pinConversation("conversation-b"));
    expect(store.getState().inbox.reminders["conversation-b"]).toBe(1);
    expect(store.getState().inbox.pinnedId).toBe("conversation-b");

    // 收权：身份重查后只剩账号 account-a
    allowed = new Set(["account-a"]);
    subscriptions[0].onEvent(accessChanged(subscriptions[0]));
    await flush();

    expect(refreshes).toBe(1);
    // 实时订阅跟随连接生命周期：范围变化不重建订阅，后续报文继续到达
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0].signal.aborted).toBe(false);
    expect(released).toBe(0);

    // 已无权的对话、名片、消息、历史、草稿、固定与提醒全部清理
    const state = store.getState().inbox;
    expect(state.conversations["conversation-b"]).toBeUndefined();
    expect(state.histories["conversation-b"]).toBeUndefined();
    expect(state.profiles["conversation-b"]).toBeUndefined();
    expect(state.drafts["conversation-b"]).toBeUndefined();
    expect(state.reminders["conversation-b"]).toBeUndefined();
    expect(selectMessages(store.getState(), "conversation-b")).toEqual([]);
    expect(state.pinnedId).toBeNull();
    expect(state.replyId).toBeNull();
    // 被清理的会话正是选中对象时提示重新选择（沿用 removed 事件的现有文案）
    expect(state.notice?.message).toBe(
      "这段会话已不可用，请选择其他会话继续接待。",
    );
    // 列表按新范围重查
    expect(
      selectQueueConversations(store.getState()).map((item) => item.id),
    ).toEqual(["conversation-a"]);

    // 仍有权数据保留
    expect(state.conversations["conversation-a"].preview).toBe(
      "你好，想问一下",
    );
    expect(state.histories["conversation-a"]?.hasLoaded).toBe(true);
    expect(state.drafts["conversation-a"].text).toBe("保留草稿");
    expect(selectMessages(store.getState(), "conversation-a")).toEqual([
      incomingMessage("conversation-a"),
    ]);
    // 新范围建立后的来信照常进入已加载历史
    subscriptions[0].onEvent({
      type: "message",
      context: subscriptions[0].context,
      message: {
        ...incomingMessage("conversation-a"),
        id: "after-scope",
        sequence: 2,
      },
    });
    expect(selectMessages(store.getState(), "conversation-a")).toHaveLength(2);
  });

  it("keeps late responses of the old scope out of the new workspace", async () => {
    const subscriptions: Subscription[] = [];
    const stalePage = deferred<ConversationPage>();
    let listReads = 0;
    const store = testStore(
      {
        subscribe: (subscription) => {
          subscriptions.push(subscription);
          subscription.onConnection("connected");
          return () => {};
        },
        listConversations: async () => {
          listReads++;
          if (listReads === 1) return stalePage.promise;
          return {
            items: [firstConversation],
            nextCursor: null,
            total: 1,
          };
        },
      },
      false,
      { refreshAccess: async () => new Set(["account-a"]) },
    );
    store.dispatch(startInboxUpdates());
    const staleRead = store.dispatch(loadConversations());

    subscriptions[0].onEvent(accessChanged(subscriptions[0]));
    await flush();
    expect(
      selectQueueConversations(store.getState()).map((item) => item.id),
    ).toEqual(["conversation-a"]);

    // 旧范围的列表响应迟到：不得写回新范围
    stalePage.resolve({
      items: [firstConversation, secondConversation],
      nextCursor: null,
      total: 2,
    });
    await staleRead;
    await flush();
    expect(
      selectQueueConversations(store.getState()).map((item) => item.id),
    ).toEqual(["conversation-a"]);
    expect(
      store.getState().inbox.conversations["conversation-b"],
    ).toBeUndefined();
  });

  it("keeps current data and still re-reads the list when the identity refresh cannot confirm", async () => {
    const subscriptions: Subscription[] = [];
    let listReads = 0;
    const store = testStore(
      {
        subscribe: (subscription) => {
          subscriptions.push(subscription);
          subscription.onConnection("connected");
          return () => {};
        },
        listConversations: async () => {
          listReads++;
          return {
            items: [firstConversation, secondConversation],
            nextCursor: null,
            total: 2,
          };
        },
      },
      true,
      { refreshAccess: async () => null },
    );
    await store.dispatch(loadConversations());
    expect(listReads).toBe(1);

    subscriptions[0].onEvent(accessChanged(subscriptions[0]));
    await flush();

    // 身份未确认时不清理任何数据，但列表仍然重查
    expect(listReads).toBe(2);
    expect(
      store.getState().inbox.conversations["conversation-b"],
    ).toBeDefined();
  });

  it("releases the subscription on workspace destruction, ignoring later access changes", async () => {
    const subscriptions: Subscription[] = [];
    let refreshes = 0;
    let released = 0;
    const store = testStore(
      {
        subscribe: (subscription) => {
          subscriptions.push(subscription);
          subscription.onConnection("connected");
          return () => {
            released++;
          };
        },
      },
      true,
      {
        refreshAccess: async () => {
          refreshes++;
          return new Set(["account-a"]);
        },
      },
    );
    await store.dispatch(loadConversations());
    store.dispatch(destroyInbox());
    expect(subscriptions[0].signal.aborted).toBe(true);
    expect(released).toBe(1);

    // 退出后迟到的范围变化不得重查或写回下一名员工的工作区
    subscriptions[0].onEvent(accessChanged(subscriptions[0]));
    await flush();
    expect(refreshes).toBe(0);
    expect(store.getState().inbox.conversations).toEqual({});
  });
});
