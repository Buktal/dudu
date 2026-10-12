import { describe, expect, it, vi } from "vitest";
import type { InboxApi } from "../api";
import type { InboxMessage, Page } from "../types";
import { openQuickHistory, pinConversation } from "./parallel";
import { loadConversations } from "./queue";
import { loadHistory, retryHistory, selectConversation } from "./reading";
import { selectMessages } from "./selectors";
import { editDraft } from "./sending";
import {
  deferred,
  firstConversation,
  incomingMessage,
  secondConversation,
  testStore,
} from "./test-support";

/**
 * 按需历史的 store 行为：首次展示才读取最近页、更早页用历史游标、同页在途合并、
 * 初始化标志与消息集合分离、三种接待模式共用缓存与草稿。
 */
describe("on-demand conversation history", () => {
  it("reads the recent page only when a conversation is first shown and reuses the cache afterwards", async () => {
    const listMessages = vi.fn(async ({ conversationId }) => ({
      items: [incomingMessage(conversationId)],
      nextCursor: null,
    }));
    const store = testStore({ listMessages });
    await store.dispatch(loadConversations());
    // 启动只把首位访客设为当前接待对象，不预取历史
    expect(listMessages).not.toHaveBeenCalled();

    await store.dispatch(selectConversation(firstConversation.id));

    expect(listMessages).toHaveBeenCalledTimes(1);
    // 最近页不带游标，页面大小由适配器按契约缺省
    expect(listMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: firstConversation.id,
        cursor: undefined,
      }),
    );

    // 切到另一位访客读取自己的最近页；切回已加载访客直接用缓存，不重查
    await store.dispatch(selectConversation(secondConversation.id));
    await store.dispatch(selectConversation(firstConversation.id));

    expect(listMessages).toHaveBeenCalledTimes(2);
    expect(selectMessages(store.getState(), firstConversation.id)).toEqual([
      incomingMessage(firstConversation.id),
    ]);
  });

  it("merges duplicate reads of the same page into one in-flight request", async () => {
    const pending = deferred<Page<InboxMessage>>();
    const listMessages = vi.fn(() => pending.promise);
    const store = testStore({ listMessages });
    await store.dispatch(loadConversations());

    const first = store.dispatch(loadHistory(firstConversation.id));
    const duplicate = store.dispatch(loadHistory(firstConversation.id));
    const displayed = store.dispatch(selectConversation(firstConversation.id));

    await duplicate;
    await displayed;
    expect(listMessages).toHaveBeenCalledTimes(1);

    pending.resolve({
      items: [incomingMessage(firstConversation.id)],
      nextCursor: null,
    });
    await first;
    expect(listMessages).toHaveBeenCalledTimes(1);
    expect(
      store.getState().inbox.histories[firstConversation.id],
    ).toMatchObject({ status: "ready", hasLoaded: true });
    expect(selectMessages(store.getState(), firstConversation.id)).toHaveLength(
      1,
    );
  });

  it("walks earlier pages through the history cursor and stops at the oldest page", async () => {
    const listMessages = vi.fn(async ({ conversationId, cursor }) =>
      cursor
        ? {
            items: [
              { ...incomingMessage(conversationId), id: "older", sequence: 1 },
            ],
            nextCursor: null,
          }
        : {
            items: [{ ...incomingMessage(conversationId), sequence: 5 }],
            nextCursor: "5",
          },
    );
    const store = testStore({ listMessages });
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation(firstConversation.id));

    await store.dispatch(loadHistory(firstConversation.id, true));

    expect(listMessages).toHaveBeenLastCalledWith(
      expect.objectContaining({
        conversationId: firstConversation.id,
        cursor: "5",
      }),
    );
    expect(
      selectMessages(store.getState(), firstConversation.id).map(
        (message) => message.sequence,
      ),
    ).toEqual([1, 5]);
    expect(
      store.getState().inbox.histories[firstConversation.id].nextCursor,
    ).toBeNull();

    // 到尾：没有更早游标就不再请求
    await store.dispatch(loadHistory(firstConversation.id, true));
    expect(listMessages).toHaveBeenCalledTimes(2);
  });

  it("marks an empty conversation as initialised with no earlier cursor", async () => {
    const listMessages = vi.fn(async () => ({ items: [], nextCursor: null }));
    const store = testStore({ listMessages });
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation(firstConversation.id));

    expect(
      store.getState().inbox.histories[firstConversation.id],
    ).toMatchObject({
      status: "ready",
      hasLoaded: true,
      nextCursor: null,
    });
    expect(selectMessages(store.getState(), firstConversation.id)).toEqual([]);
  });

  it("keeps the history init flag apart from pushed messages and merges the recent page with them", async () => {
    let subscription!: Parameters<InboxApi["subscribe"]>[0];
    const pushed = { ...incomingMessage(firstConversation.id), sequence: 3 };
    const listMessages = vi.fn(async ({ conversationId }) => ({
      items: [
        { ...incomingMessage(conversationId), id: "older", sequence: 2 },
        { ...pushed, version: 2 },
      ],
      nextCursor: "2",
    }));
    const store = testStore({
      listMessages,
      subscribe: (input) => {
        subscription = input;
        input.onConnection("connected");
        return () => {};
      },
    });
    await store.dispatch(loadConversations());
    subscription.onEvent({
      type: "message",
      id: "event-1",
      cursor: "1",
      context: subscription.context,
      message: pushed,
    });

    // 推送消息只进入消息集合，不表示历史初始化完成
    expect(selectMessages(store.getState(), firstConversation.id)).toHaveLength(
      1,
    );
    expect(
      store.getState().inbox.histories[firstConversation.id].hasLoaded,
    ).toBe(false);

    // 首次真正展示完整对话才读取最近页，并按消息 ID/version 与推送消息合并
    await store.dispatch(selectConversation(firstConversation.id));
    expect(listMessages).toHaveBeenCalledTimes(1);
    const merged = selectMessages(store.getState(), firstConversation.id);
    expect(merged.map((message) => message.id)).toEqual(["older", pushed.id]);
    expect(merged[1].version).toBe(2);
    expect(
      store.getState().inbox.histories[firstConversation.id].hasLoaded,
    ).toBe(true);
  });

  it("keeps the earlier cursor and older pages when new messages arrive", async () => {
    let subscription!: Parameters<InboxApi["subscribe"]>[0];
    const recent = { ...incomingMessage(firstConversation.id), sequence: 4 };
    const store = testStore({
      listMessages: async () => ({ items: [recent], nextCursor: "4" }),
      subscribe: (input) => {
        subscription = input;
        input.onConnection("connected");
        return () => {};
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation(firstConversation.id));

    subscription.onEvent({
      type: "message",
      id: "event-1",
      cursor: "1",
      context: subscription.context,
      message: {
        ...incomingMessage(firstConversation.id),
        id: "live",
        sequence: 9,
      },
    });

    const state = store.getState().inbox;
    // 推送不改变更早游标，旧页保留，新消息按 sequence 排在末尾
    expect(state.histories[firstConversation.id].nextCursor).toBe("4");
    expect(
      selectMessages(store.getState(), firstConversation.id).map(
        (message) => message.id,
      ),
    ).toEqual([recent.id, "live"]);
  });

  it("keeps a failed read retryable from the recent page", async () => {
    const listMessages = vi
      .fn()
      .mockRejectedValueOnce(new Error("暂时无法连接服务"))
      .mockResolvedValueOnce({
        items: [incomingMessage(firstConversation.id)],
        nextCursor: null,
      });
    const store = testStore({ listMessages });
    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation(firstConversation.id));

    expect(
      store.getState().inbox.histories[firstConversation.id],
    ).toMatchObject({
      status: "error",
      hasLoaded: false,
    });

    await store.dispatch(retryHistory(firstConversation.id));

    expect(listMessages).toHaveBeenCalledTimes(2);
    expect(
      store.getState().inbox.histories[firstConversation.id],
    ).toMatchObject({
      status: "ready",
      hasLoaded: true,
    });
  });

  it("shares one history cache and one reply draft across the three reception modes", async () => {
    const listMessages = vi.fn(async ({ conversationId }) => ({
      items: [incomingMessage(conversationId)],
      nextCursor: null,
    }));
    const store = testStore({ listMessages });
    await store.dispatch(loadConversations());

    // 专注选中
    await store.dispatch(selectConversation(firstConversation.id));
    store.dispatch(editDraft(firstConversation.id, "并排前写下的草稿"));
    // 并排固定同一访客，再在卡片模式展开完整对话
    await store.dispatch(pinConversation(firstConversation.id));
    await store.dispatch(openQuickHistory(firstConversation.id));

    expect(listMessages).toHaveBeenCalledTimes(1);
    expect(store.getState().inbox.drafts[firstConversation.id].text).toBe(
      "并排前写下的草稿",
    );
    // 固定会话保持可用，切换焦点不改变访客对应的消息集合
    await store.dispatch(selectConversation(secondConversation.id));
    expect(store.getState().inbox.pinnedId).toBe(firstConversation.id);
    expect(listMessages).toHaveBeenCalledTimes(2);
    expect(
      selectMessages(store.getState(), firstConversation.id).map(
        ({ conversationId }) => conversationId,
      ),
    ).toEqual([firstConversation.id]);
  });
});
