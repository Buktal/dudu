import { describe, expect, it, vi } from "vitest";
import type { InboxApi } from "../api";
import type { Conversation, InboxMessage } from "../types";
import { reconnectInbox } from "./events";
import { loadConversations } from "./queue";
import { markConversationRead, selectConversation } from "./reading";
import { unreadBadge } from "./reminders";
import type { InboxRootState } from "./store";
import {
  firstConversation,
  incomingMessage,
  secondConversation,
  testStore,
} from "./test-support";

type Subscription = Parameters<InboxApi["subscribe"]>[0];

/**
 * 真实链路（localUnread）的商店：订阅报文由本测试直接驱动，
 * 待处理提醒的增减走生产同一条 thunk 与合并路径。
 */
function realStore(api: Parameters<typeof testStore>[0] = {}) {
  let subscription!: Subscription;
  const store = testStore({
    localUnread: true,
    // 真实适配器解析出的会话不带个人已读
    listConversations: async () => ({
      items: [
        { ...firstConversation, unread: 0 },
        { ...secondConversation, unread: 0 },
      ],
      nextCursor: null,
      total: 2,
    }),
    ...api,
    subscribe: (input) => {
      subscription = input;
      input.onConnection("connected");
      return () => {};
    },
  });
  return {
    store,
    live(message: InboxMessage, conversation?: Conversation) {
      subscription.onEvent({
        type: "message",
        context: subscription.context,
        message,
        conversation,
      });
    },
    drop() {
      subscription.onConnection("disconnected");
    },
  };
}

function badge(state: InboxRootState, conversationId: string) {
  const conversation = state.inbox.conversations[conversationId];
  return conversation ? unreadBadge(state, conversation) : 0;
}

/** 真实适配器解析出的会话与报文都不带个人已读 */
function wire(conversation: Conversation): Conversation {
  return { ...conversation, unread: 0 };
}

describe("shared pending reminders", () => {
  it("counts a new incoming for a visitor the agent is not viewing", async () => {
    const { store, live } = realStore();
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation("conversation-a"));
    live(
      { ...incomingMessage("conversation-b"), id: "b-2", sequence: 2 },
      wire({ ...secondConversation, version: 2, messageCount: 2 }),
    );

    const state = store.getState();
    expect(badge(state, "conversation-b")).toBe(1);
    // 服务端不返回个人已读：会话自身仍保持 0，提醒只在本机运行态
    expect(state.inbox.conversations["conversation-b"].unread).toBe(0);
  });

  it("keeps quiet while the visitor is on screen", async () => {
    const { store, live } = realStore();
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation("conversation-b"));
    live(
      { ...incomingMessage("conversation-b"), id: "b-2", sequence: 2 },
      wire({ ...secondConversation, version: 2, messageCount: 2 }),
    );

    expect(badge(store.getState(), "conversation-b")).toBe(0);
  });

  it("clears the reminder once the visitor is served", async () => {
    const { store, live } = realStore();
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation("conversation-a"));
    live(
      { ...incomingMessage("conversation-b"), id: "b-2", sequence: 2 },
      wire({ ...secondConversation, version: 2, messageCount: 2 }),
    );
    expect(badge(store.getState(), "conversation-b")).toBe(1);

    // 同事在这位访客上回复成功：状态回到等待中，提醒在其他端也同步消除
    live(
      {
        ...incomingMessage("conversation-b"),
        id: "b-3",
        sequence: 3,
        direction: "outgoing",
        clientRequestId: "colleague-1",
        delivery: { state: "sent" },
      },
      wire({
        ...secondConversation,
        status: "waiting",
        version: 3,
        messageCount: 3,
      }),
    );

    expect(badge(store.getState(), "conversation-b")).toBe(0);
  });

  it("keeps a failed send as a pending reminder", async () => {
    const { store, live } = realStore();
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation("conversation-a"));
    live(
      { ...incomingMessage("conversation-b"), id: "b-2", sequence: 2 },
      wire({ ...secondConversation, version: 2, messageCount: 2 }),
    );

    live(
      {
        ...incomingMessage("conversation-b"),
        id: "b-3",
        sequence: 3,
        direction: "outgoing",
        clientRequestId: "mine-1",
        delivery: { state: "failed", reason: "渠道拒绝" },
      },
      wire({ ...secondConversation, version: 3, messageCount: 3 }),
    );

    expect(badge(store.getState(), "conversation-b")).toBe(1);
  });

  it("clears locally when the agent reads to the bottom without calling the server", async () => {
    const markRead = vi.fn();
    const { store, live } = realStore({ markRead });
    await store.dispatch(loadConversations());
    live(
      { ...incomingMessage("conversation-b"), id: "b-2", sequence: 2 },
      wire({ ...secondConversation, version: 2, messageCount: 2 }),
    );
    expect(badge(store.getState(), "conversation-b")).toBe(1);

    await store.dispatch(selectConversation("conversation-b"));
    await store.dispatch(markConversationRead("conversation-b", 2));

    expect(badge(store.getState(), "conversation-b")).toBe(0);
    expect(markRead).not.toHaveBeenCalled();
    expect(store.getState().inbox.notice).toBeNull();
  });

  it("does not fabricate reminders from a reconnect or the initial load", async () => {
    const { store } = realStore();
    await store.dispatch(loadConversations());
    expect(badge(store.getState(), "conversation-a")).toBe(0);

    await store.dispatch(reconnectInbox());

    // 重连按服务端状态重新读取，不把历史来信算成本次运行的待处理提醒
    expect(store.getState().inbox.reminders).toEqual({});
    expect(badge(store.getState(), "conversation-a")).toBe(0);
    expect(badge(store.getState(), "conversation-b")).toBe(0);
  });

  it("keeps reminders for still-unanswered visitors and clears them for served ones on reconnect", async () => {
    let lists = 0;
    const { store, live, drop } = realStore({
      listConversations: async () => {
        lists += 1;
        return {
          items: [
            { ...firstConversation, unread: 0 },
            {
              ...secondConversation,
              unread: 0,
              version: lists + 1,
              // 第三次读取（第二次重连）时同事已回复：状态变为等待中
              status: lists >= 3 ? "waiting" : "needs-reply",
            },
          ],
          nextCursor: null,
          total: 2,
        };
      },
    });
    await store.dispatch(loadConversations());
    live(
      { ...incomingMessage("conversation-b"), id: "b-2", sequence: 2 },
      { ...secondConversation, version: 2, messageCount: 2 },
    );
    expect(badge(store.getState(), "conversation-b")).toBe(1);

    // 仍待回复：重查保留本地提醒
    drop();
    await store.dispatch(reconnectInbox());
    expect(badge(store.getState(), "conversation-b")).toBe(1);

    // 已处理：重查结果按服务端状态直接展示并清除提醒
    drop();
    await store.dispatch(reconnectInbox());
    expect(store.getState().inbox.conversations["conversation-b"].status).toBe(
      "waiting",
    );
    expect(badge(store.getState(), "conversation-b")).toBe(0);
    expect(store.getState().inbox.reminders).toEqual({});
  });

  it("keeps the Mock's own unread data untouched outside the real chain", async () => {
    let subscription!: Subscription;
    const store = testStore({
      subscribe: (input) => {
        subscription = input;
        input.onConnection("connected");
        return () => {};
      },
    });
    await store.dispatch(loadConversations());
    subscription.onEvent({
      type: "message",
      context: subscription.context,
      message: { ...incomingMessage("conversation-b"), id: "b-2", sequence: 2 },
      conversation: {
        ...secondConversation,
        unread: 2,
        version: 2,
        messageCount: 2,
      },
    });

    // Mock 的未读来自自身可复现的数据，本地提醒不参与计数
    expect(store.getState().inbox.reminders).toEqual({});
    expect(badge(store.getState(), "conversation-b")).toBe(2);
  });
});
