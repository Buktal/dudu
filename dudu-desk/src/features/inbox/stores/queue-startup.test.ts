import { describe, expect, it, vi } from "vitest";
import { emptyQuery } from "../conversation-query";
import type { ConversationPage } from "../types";
import { loadConversations } from "./queue";
import {
  selectQuickQueueConversations,
  selectReplyConversation,
} from "./selectors";
import {
  deferred,
  firstConversation,
  secondConversation,
  testStore,
} from "./test-support";

describe("conversation queue startup", () => {
  it("loads authorized summaries and selects the first visitor without prefetching history or profile", async () => {
    const listConversations = vi.fn(async () => ({
      items: [firstConversation, secondConversation],
      nextCursor: null,
      total: 2,
    }));
    const listMessages = vi.fn();
    const readProfile = vi.fn();
    const store = testStore({ listConversations, listMessages, readProfile });

    await store.dispatch(loadConversations());

    expect(listConversations).toHaveBeenCalledTimes(1);
    // 启动与默认选中都不做历史/资料预取；最近页由实际展示完整对话的会话窗按需读取
    expect(listMessages).not.toHaveBeenCalled();
    expect(readProfile).not.toHaveBeenCalled();
    expect(store.getState().inbox.activeId).toBe("conversation-a");
    expect(selectReplyConversation(store.getState())).toEqual(
      firstConversation,
    );
    expect(
      selectQuickQueueConversations(store.getState()).map(({ id }) => id),
    ).toEqual(["conversation-a", "conversation-b"]);
  });
});

describe("conversation queue query switching", () => {
  it("aborts and discards a superseded query's late response", async () => {
    const stalePage = deferred<ConversationPage>();
    const signals: AbortSignal[] = [];
    const store = testStore({
      listConversations: async (input) => {
        signals.push(input.signal);
        if (signals.length === 1) return stalePage.promise;
        return {
          items: [{ ...firstConversation, id: "conversation-new" }],
          nextCursor: null,
          total: 1,
        };
      },
    });

    const stale = store.dispatch(
      loadConversations({ query: { ...emptyQuery, search: "旧条件" } }),
    );
    await store.dispatch(
      loadConversations({ query: { ...emptyQuery, search: "新条件" } }),
    );
    expect(signals[0].aborted).toBe(true);

    stalePage.resolve({ items: [firstConversation], nextCursor: null });
    await stale;

    expect(store.getState().inbox.queue.query.search).toBe("新条件");
    expect(
      selectQuickQueueConversations(store.getState()).map(({ id }) => id),
    ).toEqual(["conversation-new"]);
  });

  it("folds a continuation page by visitor identity without duplicating rows", async () => {
    const store = testStore({
      listConversations: async ({ cursor }) =>
        cursor
          ? {
              items: [{ ...secondConversation, version: 2, preview: "新摘要" }],
              nextCursor: null,
              total: 3,
            }
          : {
              items: [firstConversation, secondConversation],
              nextCursor: "2",
              total: 3,
            },
    });
    await store.dispatch(loadConversations());

    await store.dispatch(loadConversations({ more: true }));

    expect(
      selectQuickQueueConversations(store.getState()).map(({ id }) => id),
    ).toEqual(["conversation-a", "conversation-b"]);
    expect(
      store.getState().inbox.conversations["conversation-b"],
    ).toMatchObject({ version: 2, preview: "新摘要" });
    // 尾页游标为 null，没有更多可翻
    expect(store.getState().inbox.queue.nextCursor).toBeNull();
  });
});
