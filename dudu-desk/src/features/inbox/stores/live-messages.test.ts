import { describe, expect, it } from "vitest";
import type { InboxApi } from "../api";
import type { Conversation } from "../types";
import { loadConversations } from "./queue";
import { loadHistory } from "./reading";
import { selectMessages } from "./selectors";
import { incomingMessage, secondConversation, testStore } from "./test-support";

type Subscription = Parameters<InboxApi["subscribe"]>[0];

function connectedStore(api: Parameters<typeof testStore>[0] = {}) {
  let subscription!: Subscription;
  const store = testStore({
    ...api,
    subscribe: (input) => {
      subscription = input;
      input.onConnection("connected");
      return () => {};
    },
  });
  return {
    store,
    get subscription() {
      return subscription;
    },
  };
}

describe("live message events", () => {
  it("updates only the summary for an unopened visitor", async () => {
    const { store, subscription } = connectedStore();
    await store.dispatch(loadConversations());
    const summary: Conversation = {
      ...secondConversation,
      status: "waiting",
      preview: "同事已回复",
      messageCount: 9,
      version: 5,
      waitingSince: undefined,
    };

    subscription.onEvent({
      type: "message",
      context: subscription.context,
      // 真实报文没有 eventId 与游标，也不影响本规则
      message: {
        ...incomingMessage("conversation-b"),
        id: "conversation-b-message-9",
        sequence: 9,
      },
      conversation: summary,
    });

    expect(
      store.getState().inbox.conversations["conversation-b"],
    ).toMatchObject({
      status: "waiting",
      preview: "同事已回复",
      messageCount: 9,
      version: 5,
    });
    // 未打开的访客不建消息集合、不置 hasLoaded；首次打开仍按需读取最近页
    expect(selectMessages(store.getState(), "conversation-b")).toEqual([]);
    expect(store.getState().inbox.histories["conversation-b"]).toBeUndefined();
  });

  it("keeps the newer summary when a message carries an older conversation version", async () => {
    const { store, subscription } = connectedStore();
    await store.dispatch(loadConversations());

    subscription.onEvent({
      type: "message",
      context: subscription.context,
      message: incomingMessage("conversation-b"),
      conversation: { ...secondConversation, preview: "过期摘要", version: 0 },
    });

    expect(store.getState().inbox.conversations["conversation-b"].preview).toBe(
      secondConversation.preview,
    );
  });

  it("merges messages into loaded history without moving the earlier cursor", async () => {
    const { store, subscription } = connectedStore({
      listMessages: async ({ conversationId }) => ({
        items: [incomingMessage(conversationId)],
        nextCursor: "1",
      }),
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-b"));

    subscription.onEvent({
      type: "message",
      context: subscription.context,
      message: {
        ...incomingMessage("conversation-b"),
        id: "conversation-b-incoming-3",
        sequence: 3,
        body: { type: "text", text: "第三条" },
      },
      conversation: { ...secondConversation, version: 4, messageCount: 3 },
    });

    const history = store.getState().inbox.histories["conversation-b"];
    expect(history.hasLoaded).toBe(true);
    // 更早游标保持加载页给出的值，事件不会覆盖旧页边界
    expect(history.nextCursor).toBe("1");
    expect(selectMessages(store.getState(), "conversation-b")).toMatchObject([
      { id: "conversation-b-message", sequence: 1 },
      { id: "conversation-b-incoming-3", sequence: 3 },
    ]);
    expect(store.getState().inbox.conversations["conversation-b"].version).toBe(
      4,
    );
  });
});
