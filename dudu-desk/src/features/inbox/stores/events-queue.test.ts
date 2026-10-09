import { describe, expect, it, vi } from "vitest";
import { DeskApiError } from "@/lib/api-response";
import type { InboxApi } from "../api";
import { emptyQuery } from "../conversation-query";
import type { ConversationPage } from "../types";
import { loadConversations, retryConversations } from "./queue";
import { resetContext } from "./reading";
import { selectQueue, selectQuickQueueConversations } from "./selectors";
import {
  deferred,
  firstConversation,
  secondConversation,
  testStore,
} from "./test-support";

describe("live queue refresh coordination", () => {
  it("waits for an in-flight next page before refreshing conversation events and counts", async () => {
    let subscription!: Parameters<InboxApi["subscribe"]>[0];
    let pageSignal: AbortSignal | undefined;
    let holdNextPage = true;
    let first = firstConversation;
    let counts = {
      active: 2,
      needsReply: 2,
      waiting: 0,
      closed: 0,
    };
    const pendingPage = deferred<ConversationPage>();
    const store = testStore({
      subscribe: (input) => {
        subscription = input;
        input.onConnection("connected");
        return () => {};
      },
      listConversations: async ({ cursor, signal }) => {
        if (!cursor)
          return { items: [first], nextCursor: "page-two", total: 2, counts };
        if (holdNextPage) {
          holdNextPage = false;
          pageSignal = signal;
          return pendingPage.promise;
        }
        return { items: [secondConversation], nextCursor: null };
      },
    });
    await store.dispatch(loadConversations());
    const loadingMore = store.dispatch(loadConversations({ more: true }));
    first = { ...firstConversation, status: "waiting", version: 2 };
    counts = { active: 2, needsReply: 1, waiting: 1, closed: 0 };

    subscription.onEvent({
      type: "conversation",
      id: "first-conversation-updated",
      cursor: "first-conversation-updated",
      context: subscription.context,
      conversation: first,
    });
    await Promise.resolve();
    pendingPage.resolve({ items: [secondConversation], nextCursor: null });
    await loadingMore;

    expect(pageSignal?.aborted).toBe(false);
    await vi.waitFor(() => {
      expect(selectQueue(store.getState())).toMatchObject({
        status: "ready",
        counts: { needsReply: 1, waiting: 1 },
      });
      expect(
        selectQuickQueueConversations(store.getState()).map(({ id }) => id),
      ).toEqual(["conversation-a", "conversation-b"]);
    });
  });

  it.each(["query", "context"])(
    "drops the queued event refresh when the %s changes before pagination finishes",
    async (change) => {
      let subscription!: Parameters<InboxApi["subscribe"]>[0];
      let searchRead = false;
      const pendingPage = deferred<ConversationPage>();
      const searched = { ...firstConversation, id: "conversation-c" };
      const unexpected = { ...firstConversation, id: "unexpected-refresh" };
      const store = testStore({
        subscribe: (input) => {
          subscription = input;
          input.onConnection("connected");
          return () => {};
        },
        listConversations: async ({ cursor, context, query }) => {
          if (context.agentId === "new-agent")
            return { items: [unexpected], nextCursor: null };
          if (query.search) {
            const items = [searchRead ? unexpected : searched];
            searchRead = true;
            return { items, nextCursor: null };
          }
          if (cursor) return pendingPage.promise;
          return {
            items: [firstConversation],
            nextCursor: "page-two",
            counts: {
              active: 2,
              needsReply: 2,
              waiting: 0,
              closed: 0,
            },
          };
        },
      });
      await store.dispatch(loadConversations());
      const loadingMore = store.dispatch(loadConversations({ more: true }));
      subscription.onEvent({
        type: "conversation",
        id: "stale-query-update",
        cursor: "stale-query-update",
        context: subscription.context,
        conversation: { ...firstConversation, version: 2 },
      });
      await Promise.resolve();
      if (change === "query") {
        await store.dispatch(
          loadConversations({ query: { ...emptyQuery, search: "新的搜索" } }),
        );
      } else {
        store.dispatch(
          resetContext({ agentId: "new-agent", workspaceId: "new-workspace" }),
        );
      }
      pendingPage.resolve({ items: [secondConversation], nextCursor: null });
      await loadingMore;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(
        selectQuickQueueConversations(store.getState()).map(({ id }) => id),
      ).toEqual(change === "query" ? ["conversation-c"] : []);
      expect(
        store.getState().inbox.conversations["conversation-b"],
      ).toBeUndefined();
      expect(
        store.getState().inbox.conversations["unexpected-refresh"],
      ).toBeUndefined();
    },
  );

  it.each(["business", "invalid-response"] as const)(
    "keeps a %s pagination failure visible until retry succeeds before consuming the queued refresh",
    async (kind) => {
      let subscription!: Parameters<InboxApi["subscribe"]>[0];
      let holdNextPage = true;
      let first = firstConversation;
      let counts = {
        active: 2,
        needsReply: 2,
        waiting: 0,
        closed: 0,
      };
      const pendingPage = deferred<ConversationPage>();
      const store = testStore({
        subscribe: (input) => {
          subscription = input;
          input.onConnection("connected");
          return () => {};
        },
        listConversations: async ({ cursor }) => {
          if (!cursor)
            return { items: [first], nextCursor: "page-two", total: 2, counts };
          if (holdNextPage) {
            holdNextPage = false;
            return pendingPage.promise;
          }
          return { items: [secondConversation], nextCursor: null };
        },
      });
      await store.dispatch(loadConversations());
      const loadingMore = store.dispatch(loadConversations({ more: true }));
      first = { ...firstConversation, status: "waiting", version: 2 };
      counts = { active: 2, needsReply: 1, waiting: 1, closed: 0 };
      subscription.onEvent({
        type: "conversation",
        id: "update-before-failed-page",
        cursor: "update-before-failed-page",
        context: subscription.context,
        conversation: first,
      });
      await Promise.resolve();
      pendingPage.reject(new DeskApiError(kind, "下一页暂时读取失败"));
      await loadingMore;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect(selectQueue(store.getState())).toMatchObject({
        status: "error",
        failedRead: "more",
        error: { kind, message: "下一页暂时读取失败" },
        counts: { needsReply: 2, waiting: 0 },
      });

      await store.dispatch(retryConversations());

      await vi.waitFor(() => {
        expect(selectQueue(store.getState())).toMatchObject({
          status: "ready",
          error: null,
          counts: { needsReply: 1, waiting: 1 },
        });
        expect(
          selectQuickQueueConversations(store.getState()).map(({ id }) => id),
        ).toEqual(["conversation-a", "conversation-b"]);
      });
    },
  );
});
