import { describe, expect, it, vi } from "vitest";
import type { InboxApi } from "../api";
import { emptyQuery } from "../conversation-query";
import type { ConversationPage } from "../types";
import { reconnectInbox } from "./events";
import { loadConversations } from "./queue";
import { selectQueue, selectQueueConversations } from "./selectors";
import { editDraft } from "./sending";
import {
  deferred,
  firstConversation,
  incomingMessage,
  secondConversation,
  testStore,
} from "./test-support";

describe("recovered conversation queries", () => {
  it("refreshes queue totals, status counts and channels across recovery pages", async () => {
    let loaded = false;
    const store = testStore({
      listConversations: async ({ cursor }) => {
        if (!loaded) {
          loaded = true;
          return {
            items: [firstConversation],
            nextCursor: null,
            total: 1,
            counts: {
              active: 1,
              needsReply: 1,
              waiting: 0,
              closed: 0,
            },
            channels: [{ id: "wechat-kf", name: "微信客服" }],
          };
        }
        if (cursor)
          return { items: [secondConversation], nextCursor: null, total: 2 };
        return {
          items: [firstConversation],
          nextCursor: "recovery-page-two",
          total: 2,
          counts: {
            active: 2,
            needsReply: 2,
            waiting: 0,
            closed: 1,
          },
          channels: [
            { id: "wechat-kf", name: "微信客服" },
            { id: "telegram", name: "Telegram" },
          ],
        };
      },
      getCapability: async () => ({ state: "allowed", kinds: ["text"] }),
    });

    await store.dispatch(loadConversations());
    await store.dispatch(reconnectInbox());

    expect(selectQueue(store.getState())).toMatchObject({
      ids: ["conversation-a", "conversation-b"],
      nextCursor: null,
      total: 2,
      counts: {
        active: 2,
        needsReply: 2,
        waiting: 0,
        closed: 1,
      },
      channels: [
        { id: "wechat-kf", name: "微信客服" },
        { id: "telegram", name: "Telegram" },
      ],
    });
  });

  it("uses recovered full-text membership while retaining reply targets and drafts outside the results", async () => {
    let recovering = false;
    const thirdConversation = {
      ...firstConversation,
      id: "conversation-c",
      identity: { ...firstConversation.identity, id: "visitor-c" },
    };
    const store = testStore({
      listConversations: async ({ cursor }) => {
        if (!recovering)
          return {
            items: [firstConversation, secondConversation],
            nextCursor: null,
          };
        return cursor
          ? { items: [secondConversation], nextCursor: null }
          : { items: [thirdConversation], nextCursor: "history-matches" };
      },
      getCapability: async () => ({ state: "allowed", kinds: ["text"] }),
    });
    await store.dispatch(
      loadConversations({ query: { ...emptyQuery, search: "保修工单" } }),
    );
    store.dispatch(editDraft(firstConversation.id, "尚未发出的回复"));
    recovering = true;

    await store.dispatch(reconnectInbox());

    expect(
      selectQueueConversations(store.getState()).map(({ id }) => id),
    ).toEqual(["conversation-b", "conversation-c"]);
    expect(store.getState().inbox).toMatchObject({
      replyId: "conversation-a",
      activeId: "conversation-a",
      drafts: { "conversation-a": { text: "尚未发出的回复" } },
      queue: { query: { search: "保修工单" } },
    });
  });

  it("refreshes search matches received while the connection is recovering", async () => {
    let subscription!: Parameters<InboxApi["subscribe"]>[0];
    let recovering = false;
    let recoveryReadStarted = false;
    const pending = deferred<ConversationPage>();
    const store = testStore({
      subscribe: (input) => {
        subscription = input;
        input.onConnection("connected");
        return () => {};
      },
      listConversations: async () => {
        if (!recovering)
          return { items: [firstConversation], nextCursor: null };
        if (!recoveryReadStarted) {
          recoveryReadStarted = true;
          return pending.promise;
        }
        return {
          items: [firstConversation, secondConversation],
          nextCursor: null,
        };
      },
      getCapability: async () => ({ state: "allowed", kinds: ["text"] }),
    });
    await store.dispatch(
      loadConversations({ query: { ...emptyQuery, search: "保修工单" } }),
    );
    recovering = true;
    const recovery = store.dispatch(reconnectInbox());
    subscription.onEvent({
      type: "message",
      id: "recovery-history-match",
      cursor: "recovery-history-match",
      context: subscription.context,
      message: {
        ...incomingMessage(secondConversation.id),
        body: { type: "text", text: "请查询保修工单" },
      },
    });
    await Promise.resolve();
    pending.resolve({ items: [firstConversation], nextCursor: null });
    await recovery;

    await vi.waitFor(() => {
      expect(
        selectQueueConversations(store.getState()).map(({ id }) => id),
      ).toEqual(["conversation-a", "conversation-b"]);
    });
  });
});
