import { describe, expect, it } from "vitest";
import { DeskApiError } from "@/lib/api-response";
import { loadConversations, retryConversations } from "./queue";
import { selectQueue, selectQuickQueueConversations } from "./selectors";
import {
  firstConversation,
  secondConversation,
  testStore,
} from "./test-support";

describe("conversation queue retries", () => {
  it.each([null, "page-two"])(
    "retries a failed refresh with existing cards when the next cursor is %s",
    async (nextCursor) => {
      let fail = false;
      let refreshed = false;
      const store = testStore({
        listConversations: async ({ cursor }) => {
          if (cursor) return { items: [secondConversation], nextCursor: null };
          if (fail) throw new DeskApiError("business", "会话列表暂时读取失败");
          return {
            items: [
              refreshed
                ? {
                    ...firstConversation,
                    version: 2,
                    preview: "刷新后恢复的内容",
                  }
                : firstConversation,
            ],
            nextCursor,
          };
        },
      });
      await store.dispatch(loadConversations());
      fail = true;
      await store.dispatch(loadConversations());
      expect(selectQueue(store.getState()).status).toBe("error");
      fail = false;
      refreshed = true;

      await store.dispatch(retryConversations());

      expect(selectQueue(store.getState())).toMatchObject({
        status: "ready",
        error: null,
        nextCursor,
      });
      expect(selectQuickQueueConversations(store.getState())).toMatchObject([
        { id: "conversation-a", preview: "刷新后恢复的内容" },
      ]);
    },
  );

  it("retries the failed continuation page while retaining the current cards and reply target", async () => {
    let fail = true;
    const store = testStore({
      listConversations: async ({ cursor }) => {
        if (!cursor)
          return { items: [firstConversation], nextCursor: "page-two" };
        if (fail) throw new DeskApiError("business", "下一页暂时读取失败");
        return { items: [secondConversation], nextCursor: null };
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadConversations({ more: true }));
    expect(selectQueue(store.getState()).status).toBe("error");
    fail = false;

    await store.dispatch(retryConversations());

    expect(
      selectQuickQueueConversations(store.getState()).map(({ id }) => id),
    ).toEqual(["conversation-a", "conversation-b"]);
    expect(selectQueue(store.getState())).toMatchObject({
      status: "ready",
      nextCursor: null,
      error: null,
    });
    expect(store.getState().inbox.replyId).toBe("conversation-a");
  });
});
