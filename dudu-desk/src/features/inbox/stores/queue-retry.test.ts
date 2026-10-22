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

  it("downgrades the connection with a failed read and restores it when the retry succeeds", async () => {
    let fail = false;
    const store = testStore({
      listConversations: async () => {
        if (fail) throw new DeskApiError("network", "服务请求失败（HTTP 500）");
        return { items: [firstConversation], nextCursor: null };
      },
    });
    await store.dispatch(loadConversations());
    expect(store.getState().inbox.connection).toBe("connected");
    fail = true;
    await store.dispatch(loadConversations());
    expect(selectQueue(store.getState()).status).toBe("error");
    expect(store.getState().inbox.connection).toBe("disconnected");
    fail = false;

    await store.dispatch(retryConversations());

    expect(selectQueue(store.getState()).status).toBe("ready");
    // 重试成功的重查证实服务可达：连接态不再卡在断开
    expect(store.getState().inbox.connection).toBe("connected");
  });

  it("maps an unavailable read to the unavailable connection and leaves business failures alone", async () => {
    let kind: "unavailable" | "business" = "unavailable";
    const store = testStore({
      listConversations: async () => {
        throw kind === "unavailable"
          ? new DeskApiError("unavailable", "接待服务尚未连接")
          : new DeskApiError("business", "会话列表暂时读取失败");
      },
    });
    await store.dispatch(loadConversations());
    expect(selectQueue(store.getState()).status).toBe("error");
    expect(store.getState().inbox.connection).toBe("unavailable");
    kind = "business";
    await store.dispatch(loadConversations());
    expect(selectQueue(store.getState()).status).toBe("error");
    // 业务失败不降级连接态：订阅仍在，降级只针对不可用/断网/认证失败
    expect(store.getState().inbox.connection).toBe("unavailable");
  });
});
