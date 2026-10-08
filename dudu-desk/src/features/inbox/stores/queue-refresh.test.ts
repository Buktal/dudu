import { describe, expect, it } from "vitest";
import { emptyQuery } from "../conversation-query";
import { loadConversations } from "./queue";
import {
  selectQueue,
  selectQueueConversations,
  selectQuickQueueConversations,
} from "./selectors";
import { editDraft, focusReply } from "./sending";
import { firstConversation, testStore } from "./test-support";

describe("loaded conversation window refresh", () => {
  it("refreshes the loaded pages, keeps quick card positions and leaves later pages available", async () => {
    let refreshing = false;
    const first = { ...firstConversation, messageCount: 10 };
    const second = { ...first, id: "conversation-b", messageCount: 8 };
    const third = { ...first, id: "conversation-c", messageCount: 6 };
    const fourth = { ...first, id: "conversation-d", messageCount: 4 };
    const fifth = { ...first, id: "conversation-e", messageCount: 20 };
    const store = testStore({
      listConversations: async ({ cursor }) => {
        if (!refreshing)
          return cursor
            ? { items: [third, fourth], nextCursor: "initial-later", total: 6 }
            : {
                items: [first, second],
                nextCursor: "initial-page-two",
                total: 6,
              };
        if (!cursor)
          return {
            items: [fifth, { ...third, messageCount: 15, version: 2 }],
            nextCursor: "refreshed-page-two",
            total: 6,
          };
        if (cursor === "refreshed-page-two")
          return {
            items: [first, second, fourth],
            nextCursor: "refreshed-later",
            total: 6,
          };
        throw new Error("The refresh must stop at the loaded window");
      },
    });
    await store.dispatch(
      loadConversations({
        query: { ...emptyQuery, order: "messages", search: "保修" },
      }),
    );
    await store.dispatch(loadConversations({ more: true }));
    refreshing = true;

    await store.dispatch(loadConversations());

    expect(
      selectQuickQueueConversations(store.getState()).map(({ id }) => id),
    ).toEqual([
      "conversation-a",
      "conversation-b",
      "conversation-c",
      "conversation-d",
      "conversation-e",
    ]);
    expect(
      selectQueueConversations(store.getState()).map(({ id }) => id),
    ).toEqual([
      "conversation-e",
      "conversation-c",
      "conversation-a",
      "conversation-b",
      "conversation-d",
    ]);
    expect(selectQueue(store.getState())).toMatchObject({
      nextCursor: "refreshed-later",
      total: 6,
      status: "ready",
      error: null,
    });
  });

  it("keeps an input card when another search match moves it beyond the original page size", async () => {
    let refreshing = false;
    const first = { ...firstConversation, messageCount: 10 };
    const second = { ...first, id: "conversation-b", messageCount: 8 };
    const third = { ...first, id: "conversation-c", messageCount: 6 };
    const fourth = { ...first, id: "conversation-d", messageCount: 4 };
    const fifth = {
      ...first,
      id: "conversation-e",
      messageCount: 20,
      version: 2,
    };
    const store = testStore({
      listConversations: async ({ cursor }) => {
        if (!refreshing)
          return {
            items: [first, second, third, fourth],
            nextCursor: "page-two",
            total: 5,
          };
        return cursor
          ? { items: [fourth], nextCursor: null, total: 5 }
          : {
              items: [fifth, first, second, third],
              nextCursor: "page-two",
              total: 5,
            };
      },
    });
    await store.dispatch(
      loadConversations({
        query: { ...emptyQuery, order: "messages", search: "同一个历史关键词" },
      }),
    );
    store.dispatch(focusReply(fourth.id));
    store.dispatch(editDraft(fourth.id, "正在输入的未发送内容"));
    refreshing = true;

    await store.dispatch(loadConversations());

    expect(
      selectQuickQueueConversations(store.getState()).map(({ id }) => id),
    ).toEqual([
      "conversation-a",
      "conversation-b",
      "conversation-c",
      "conversation-d",
      "conversation-e",
    ]);
    expect(store.getState().inbox).toMatchObject({
      replyId: "conversation-d",
      drafts: { "conversation-d": { text: "正在输入的未发送内容" } },
    });
  });

  it("rejects a repeated continuation cursor without replacing loaded cards", async () => {
    const store = testStore({
      listConversations: async ({ cursor }) => ({
        items: cursor
          ? [{ ...firstConversation, id: "conversation-b" }]
          : [firstConversation],
        nextCursor: "repeated-page",
      }),
    });
    await store.dispatch(loadConversations());

    await store.dispatch(loadConversations({ more: true }));

    expect(
      selectQuickQueueConversations(store.getState()).map(({ id }) => id),
    ).toEqual(["conversation-a"]);
    expect(selectQueue(store.getState())).toMatchObject({
      status: "error",
      error: { kind: "invalid-response" },
    });
  });

  it("reads the remaining service pages before removing a previous full-text match", async () => {
    let refreshing = false;
    const second = { ...firstConversation, id: "conversation-b" };
    const third = { ...firstConversation, id: "conversation-c" };
    const fourth = { ...firstConversation, id: "conversation-d" };
    const store = testStore({
      listConversations: async ({ cursor }) => {
        if (!refreshing)
          return { items: [firstConversation, second], nextCursor: null };
        return cursor
          ? { items: [fourth], nextCursor: null }
          : {
              items: [firstConversation, third],
              nextCursor: "remaining-matches",
            };
      },
    });
    await store.dispatch(
      loadConversations({ query: { ...emptyQuery, search: "原来匹配的标签" } }),
    );
    store.dispatch(focusReply(second.id));
    store.dispatch(editDraft(second.id, "离开列表也保留的草稿"));
    refreshing = true;

    await store.dispatch(loadConversations());

    expect(
      selectQuickQueueConversations(store.getState()).map(({ id }) => id),
    ).toEqual(["conversation-a", "conversation-c", "conversation-d"]);
    expect(store.getState().inbox).toMatchObject({
      replyId: "conversation-b",
      drafts: { "conversation-b": { text: "离开列表也保留的草稿" } },
    });
  });
});
