import { describe, expect, it } from "vitest";
import type { InboxApi } from "../api";
import { loadConversations } from "./reading";
import {
  selectQueueConversations,
  selectQuickQueueConversations,
} from "./selectors";
import { emptyQuery } from "./state";
import {
  firstConversation,
  secondConversation,
  testStore,
} from "./test-support";

describe("reception queue ordering", () => {
  it("keeps waiting visitors first when a conversation stops needing a reply", async () => {
    let subscription!: Parameters<InboxApi["subscribe"]>[0];
    const first = {
      ...firstConversation,
      waitingSince: "2026-09-16T00:00:00Z",
    };
    const second = {
      ...secondConversation,
      waitingSince: "2026-09-16T00:02:00Z",
    };
    const store = testStore({
      subscribe: (input) => {
        subscription = input;
        input.onConnection("connected");
        return () => {};
      },
      listConversations: async () => ({
        items: [first, second],
        nextCursor: null,
      }),
    });
    await store.dispatch(loadConversations());

    subscription.onEvent({
      type: "conversation",
      id: "first-reply-confirmed",
      cursor: "first-reply-confirmed",
      context: subscription.context,
      conversation: {
        ...first,
        status: "waiting",
        waitingSince: undefined,
        updatedAt: "2026-09-16T00:03:00Z",
        version: 2,
      },
    });

    expect(
      selectQueueConversations(store.getState()).map(({ id }) => id),
    ).toEqual(["conversation-b", "conversation-a"]);
    expect(
      selectQuickQueueConversations(store.getState()).map(({ id }) => id),
    ).toEqual(["conversation-a", "conversation-b"]);
  });

  it("reorders by message count while quick cards stay fixed until filters change", async () => {
    let subscription!: Parameters<InboxApi["subscribe"]>[0];
    const first = { ...firstConversation, messageCount: 3 };
    const second = { ...secondConversation, messageCount: 2 };
    const updatedSecond = { ...second, messageCount: 10, version: 2 };
    let page = [first, second];
    const store = testStore({
      subscribe: (input) => {
        subscription = input;
        input.onConnection("connected");
        return () => {};
      },
      listConversations: async () => ({ items: page, nextCursor: null }),
    });
    await store.dispatch(
      loadConversations({ query: { ...emptyQuery, order: "messages" } }),
    );

    subscription.onEvent({
      type: "conversation",
      id: "second-has-more-messages",
      cursor: "second-has-more-messages",
      context: subscription.context,
      conversation: updatedSecond,
    });

    expect(
      selectQueueConversations(store.getState()).map(({ id }) => id),
    ).toEqual(["conversation-b", "conversation-a"]);
    expect(
      selectQuickQueueConversations(store.getState()).map(({ id }) => id),
    ).toEqual(["conversation-a", "conversation-b"]);

    page = [updatedSecond, first];
    await store.dispatch(
      loadConversations({
        query: { ...emptyQuery, order: "messages", search: "完整历史关键词" },
      }),
    );

    expect(
      selectQuickQueueConversations(store.getState()).map(({ id }) => id),
    ).toEqual(["conversation-b", "conversation-a"]);
  });
});
