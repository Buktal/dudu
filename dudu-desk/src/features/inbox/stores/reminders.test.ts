import { describe, expect, it } from "vitest";
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
 * 真实链路的商店：订阅报文由本测试直接驱动，
 * 待处理提醒的增减走生产同一条 thunk 与合并路径。
 */
function realStore(api: Parameters<typeof testStore>[0] = {}) {
  let subscription!: Subscription;
  const store = testStore({
    listConversations: async () => ({
      items: [firstConversation, secondConversation],
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
    conversation(frame: Conversation) {
      subscription.onEvent({
        type: "conversation",
        context: subscription.context,
        conversation: frame,
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

describe("shared pending reminders", () => {
  it("counts a new incoming for a visitor the agent is not viewing", async () => {
    const { store, live } = realStore();
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation("conversation-a"));
    live(
      { ...incomingMessage("conversation-b"), id: "b-2", sequence: 2 },
      { ...secondConversation, version: 2, messageCount: 2 },
    );

    const state = store.getState();
    expect(badge(state, "conversation-b")).toBe(1);
  });

  it("keeps quiet while the visitor is on screen", async () => {
    const { store, live } = realStore();
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation("conversation-b"));
    live(
      { ...incomingMessage("conversation-b"), id: "b-2", sequence: 2 },
      { ...secondConversation, version: 2, messageCount: 2 },
    );

    expect(badge(store.getState(), "conversation-b")).toBe(0);
  });

  it("clears the reminder once the visitor is served", async () => {
    const { store, live } = realStore();
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation("conversation-a"));
    live(
      { ...incomingMessage("conversation-b"), id: "b-2", sequence: 2 },
      { ...secondConversation, version: 2, messageCount: 2 },
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
      {
        ...secondConversation,
        status: "waiting",
        version: 3,
        messageCount: 3,
      },
    );

    expect(badge(store.getState(), "conversation-b")).toBe(0);
  });

  it("keeps a failed send as a pending reminder", async () => {
    const { store, live } = realStore();
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation("conversation-a"));
    live(
      { ...incomingMessage("conversation-b"), id: "b-2", sequence: 2 },
      { ...secondConversation, version: 2, messageCount: 2 },
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
      { ...secondConversation, version: 3, messageCount: 3 },
    );

    expect(badge(store.getState(), "conversation-b")).toBe(1);
  });

  it("clears the reminder when another agent ends the conversation", async () => {
    const { store, live, conversation } = realStore();
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation("conversation-a"));
    live(
      { ...incomingMessage("conversation-b"), id: "b-2", sequence: 2 },
      { ...secondConversation, version: 2, messageCount: 2 },
    );
    expect(badge(store.getState(), "conversation-b")).toBe(1);

    // 他端结束接待：conversation 报文把共享状态带到已结束，其他端的提醒同步消除
    conversation({
      ...secondConversation,
      status: "closed",
      version: 3,
      messageCount: 2,
    });

    expect(badge(store.getState(), "conversation-b")).toBe(0);
    expect(store.getState().inbox.reminders).toEqual({});
  });

  it("keeps the reminder when a newer incoming still awaits a reply", async () => {
    const { store, live, conversation } = realStore();
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation("conversation-a"));
    // 较新的来信把访客带回待回复
    live(
      { ...incomingMessage("conversation-b"), id: "b-4", sequence: 4 },
      { ...secondConversation, version: 4, messageCount: 4 },
    );
    expect(badge(store.getState(), "conversation-b")).toBe(1);

    // 迟到的较旧结束报文不覆盖较新的待回复状态，也不清除提醒
    conversation({
      ...secondConversation,
      status: "closed",
      version: 3,
      messageCount: 2,
    });

    expect(store.getState().inbox.conversations["conversation-b"].status).toBe(
      "needs-reply",
    );
    expect(badge(store.getState(), "conversation-b")).toBe(1);
  });

  it("clears closed visitors on reconnect without rebuilding reminders", async () => {
    let closed = false;
    const { store, live, drop } = realStore({
      listConversations: async () => ({
        items: [
          firstConversation,
          {
            ...secondConversation,
            status: closed ? "closed" : "needs-reply",
            version: closed ? 3 : 1,
          },
        ],
        nextCursor: null,
        total: 2,
      }),
    });
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation("conversation-a"));
    live(
      { ...incomingMessage("conversation-b"), id: "b-2", sequence: 2 },
      { ...secondConversation, version: 2, messageCount: 2 },
    );
    expect(badge(store.getState(), "conversation-b")).toBe(1);

    // 重连补回的是已结束的访客：提醒不重建
    closed = true;
    drop();
    await store.dispatch(reconnectInbox());

    expect(store.getState().inbox.conversations["conversation-b"].status).toBe(
      "closed",
    );
    expect(badge(store.getState(), "conversation-b")).toBe(0);
    expect(store.getState().inbox.reminders).toEqual({});
  });

  it("clears locally when the agent reads to the bottom without calling the server", async () => {
    const { store, live } = realStore();
    await store.dispatch(loadConversations());
    live(
      { ...incomingMessage("conversation-b"), id: "b-2", sequence: 2 },
      { ...secondConversation, version: 2, messageCount: 2 },
    );
    expect(badge(store.getState(), "conversation-b")).toBe(1);

    await store.dispatch(selectConversation("conversation-b"));
    await store.dispatch(markConversationRead("conversation-b", 2));

    expect(badge(store.getState(), "conversation-b")).toBe(0);
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
            firstConversation,
            {
              ...secondConversation,
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
});
