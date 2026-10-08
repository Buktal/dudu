import { describe, expect, it, vi } from "vitest";
import { DeskApiError } from "@/lib/api-response";
import { type InboxApi, unavailableInboxApi } from "../api";
import type { Conversation, InboxMessage, Page } from "../types";
import { setConversationStarred } from "./details";
import { pinConversation } from "./parallel";
import { loadConversations } from "./queue";
import {
  loadHistory,
  markConversationRead,
  resetContext,
  retryHistory,
  selectConversation,
} from "./reading";
import {
  selectActiveConversation,
  selectMessages,
  selectQueueConversations,
} from "./selectors";
import { endReception } from "./sending";
import { createInboxStore } from "./store";
import {
  deferred,
  firstConversation,
  incomingMessage,
  secondConversation,
  testStore,
} from "./test-support";

describe("reading conversations through the inbox workflow", () => {
  it("keeps same-name visitors from different receiving accounts separate", async () => {
    const store = createInboxStore({
      context: { agentId: "agent-a", workspaceId: "workspace-a" },
      api: {
        ...unavailableInboxApi,
        listConversations: async () => ({
          items: [firstConversation, secondConversation],
          nextCursor: null,
          total: 2,
        }),
        listMessages: async ({ conversationId }) => ({
          items: [incomingMessage(conversationId)],
          nextCursor: null,
        }),
      },
    });

    await store.dispatch(loadConversations());
    await store.dispatch(selectConversation("conversation-b"));

    expect(selectActiveConversation(store.getState())?.identity).toMatchObject({
      id: "visitor-b",
      name: "林小满",
      accountId: "account-b",
    });
    expect(selectMessages(store.getState(), "conversation-b")).toEqual([
      incomingMessage("conversation-b"),
    ]);
  });

  it("merges overlapping history pages by stable identity and sequence, retaining content after a page failure", async () => {
    const latest = {
      ...incomingMessage("conversation-a"),
      sequence: 2,
      version: 2,
    };
    const older = { ...latest, id: "older-message", sequence: 1 };
    let fail = false;
    const store = testStore({
      listMessages: async ({ conversationId, cursor }) => {
        if (fail)
          throw new DeskApiError("business", "暂时无法读取更早消息", 50001);
        return {
          items:
            conversationId === "conversation-a"
              ? cursor
                ? [older, { ...latest, version: 1 }]
                : [latest]
              : [],
          nextCursor: cursor ? "oldest" : "older",
        };
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a", true));
    expect(selectMessages(store.getState(), "conversation-a")).toEqual([
      older,
      latest,
    ]);
    fail = true;
    await store.dispatch(loadHistory("conversation-a", true));
    expect(selectMessages(store.getState(), "conversation-a")).toHaveLength(2);
    expect(store.getState().inbox.histories["conversation-a"].error?.kind).toBe(
      "business",
    );
  });

  it("aborts old reads and rejects late results when the selected visitor changes", async () => {
    const pending = deferred<Page<InboxMessage>>();
    let signal: AbortSignal | undefined;
    const store = testStore({
      listMessages: async (input) => {
        if (input.conversationId === "conversation-a") {
          signal = input.signal;
          return pending.promise;
        }
        return {
          items: [incomingMessage(input.conversationId)],
          nextCursor: null,
        };
      },
    });
    const initial = store.dispatch(loadConversations());
    // State-driven wait: the auto-select chain resolves in a tick count that
    // paging refactors may shift, so wait for the in-flight read itself.
    await vi.waitFor(() => expect(signal).toBeDefined());
    await store.dispatch(selectConversation("conversation-b"));
    expect(signal?.aborted).toBe(true);
    pending.resolve({
      items: [incomingMessage("conversation-a")],
      nextCursor: null,
    });
    await initial;
    expect(selectActiveConversation(store.getState())?.id).toBe(
      "conversation-b",
    );
    expect(selectMessages(store.getState(), "conversation-a")).toEqual([]);
  });

  it("resumes an interrupted older-page read after switching back without accepting the cancelled page", async () => {
    const cancelledPage = deferred<Page<InboxMessage>>();
    const retryPage = deferred<Page<InboxMessage>>();
    const latest = { ...incomingMessage("conversation-a"), sequence: 3 };
    const older = { ...latest, id: "confirmed-older", sequence: 2 };
    const olderReads: { cursor: string | undefined; signal: AbortSignal }[] =
      [];
    const store = testStore({
      listMessages: async (input) => {
        if (input.conversationId !== "conversation-a")
          return {
            items: [incomingMessage(input.conversationId)],
            nextCursor: null,
          };
        if (!input.cursor) return { items: [latest], nextCursor: "older-page" };
        olderReads.push({ cursor: input.cursor, signal: input.signal });
        return olderReads.length === 1
          ? cancelledPage.promise
          : retryPage.promise;
      },
    });
    await store.dispatch(loadConversations());
    const cancelled = store.dispatch(loadHistory("conversation-a", true));
    await store.dispatch(selectConversation("conversation-b"));
    expect(olderReads[0].signal.aborted).toBe(true);
    expect(store.getState().inbox.histories["conversation-a"]).toMatchObject({
      hasLoaded: true,
      nextCursor: "older-page",
    });
    expect(selectMessages(store.getState(), "conversation-a")).toEqual([
      latest,
    ]);
    await store.dispatch(selectConversation("conversation-a"));
    const retried = store.dispatch(loadHistory("conversation-a", true));
    expect(olderReads.map((read) => read.cursor)).toEqual([
      "older-page",
      "older-page",
    ]);
    cancelledPage.resolve({
      items: [{ ...latest, id: "late-cancelled", sequence: 1, version: 100 }],
      nextCursor: null,
    });
    await cancelled;
    expect(store.getState().inbox.histories["conversation-a"].status).toBe(
      "loading",
    );
    expect(selectMessages(store.getState(), "conversation-a")).toEqual([
      latest,
    ]);
    retryPage.resolve({ items: [older, latest], nextCursor: "even-older" });
    await retried;
    expect(store.getState().inbox.histories["conversation-a"]).toMatchObject({
      status: "ready",
      hasLoaded: true,
      nextCursor: "even-older",
    });
    expect(selectMessages(store.getState(), "conversation-a")).toEqual([
      older,
      latest,
    ]);
  });

  it.each([
    {
      change: "arrivals",
      conversation: { ...firstConversation, id: "conversation-c" },
      items: [secondConversation, firstConversation],
      expectedIds: ["conversation-a", "conversation-b", "conversation-c"],
    },
    {
      change: "updates",
      conversation: { ...secondConversation, version: 2, preview: "新的问题" },
      items: [firstConversation],
      expectedIds: ["conversation-a", "conversation-b"],
    },
  ])(
    "preserves matching $change and row order during a refresh while allowing later removal of unchanged rows",
    async ({ conversation, items, expectedIds }) => {
      let subscription!: Parameters<InboxApi["subscribe"]>[0];
      let reads = 0;
      const refresh = deferred<Page<Conversation>>();
      const store = testStore({
        subscribe: (input) => {
          subscription = input;
          input.onConnection("connected");
          return () => {};
        },
        listConversations: async () => {
          reads++;
          if (reads === 2) return refresh.promise;
          return {
            items:
              reads === 1
                ? [firstConversation, secondConversation]
                : [firstConversation],
            nextCursor: null,
          };
        },
      });
      await store.dispatch(loadConversations());
      const loading = store.dispatch(loadConversations());
      subscription.onEvent({
        type: "conversation",
        id: "new-conversation",
        cursor: "new-conversation",
        context: subscription.context,
        conversation,
      });
      expect(
        selectQueueConversations(store.getState()).map((item) => item.id),
      ).toEqual(expectedIds);
      refresh.resolve({ items, nextCursor: null });
      await loading;
      expect(
        selectQueueConversations(store.getState()).map((item) => item.id),
      ).toEqual(expectedIds);
      expect(store.getState().inbox.conversations[conversation.id]).toEqual(
        conversation,
      );
      expect(store.getState().inbox.replyId).toBe("conversation-a");
      await store.dispatch(loadConversations());
      expect(
        selectQueueConversations(store.getState()).map((item) => item.id),
      ).toEqual(["conversation-a"]);
    },
  );

  it("aligns filtered queue membership after API-only end, read and star responses without changing targets", async () => {
    const first = { ...firstConversation, starred: true };
    const second = { ...secondConversation, starred: true };
    const store = testStore({
      listConversations: async () => ({
        items: [first, second],
        nextCursor: null,
      }),
      endConversation: async () => ({ ...first, version: 2, status: "closed" }),
      markRead: async () => ({ ...second, version: 2, unread: 0 }),
      setStarred: async ({ starred }) => ({
        ...second,
        version: starred ? 4 : 3,
        starred,
      }),
    });
    await store.dispatch(
      loadConversations({
        query: {
          search: "",
          channelId: "all",
          status: "needs-reply",
          starred: true,
          order: "wait",
        },
      }),
    );
    await store.dispatch(pinConversation("conversation-b"));
    const { activeId, replyId, pinnedId } = store.getState().inbox;
    await store.dispatch(endReception("conversation-a"));
    expect(
      selectQueueConversations(store.getState()).map((item) => item.id),
    ).toEqual(["conversation-b"]);
    await store.dispatch(markConversationRead("conversation-b", 1));
    expect(
      store.getState().inbox.conversations["conversation-b"],
    ).toMatchObject({ status: "needs-reply", unread: 0 });
    await store.dispatch(setConversationStarred("conversation-b", false));
    expect(selectQueueConversations(store.getState())).toEqual([]);
    await store.dispatch(setConversationStarred("conversation-b", true));
    expect(
      selectQueueConversations(store.getState()).map((item) => item.id),
    ).toEqual(["conversation-b"]);
    expect(store.getState().inbox).toMatchObject({
      activeId,
      replyId,
      pinnedId,
    });
  });

  it("discards responses and all reading state when the work context is replaced", async () => {
    const pending = deferred<Page<InboxMessage>>();
    const store = testStore({ listMessages: () => pending.promise });
    const reading = store.dispatch(loadConversations());
    await Promise.resolve();
    store.dispatch(
      resetContext({ agentId: "agent-b", workspaceId: "workspace-b" }),
    );
    pending.resolve({
      items: [incomingMessage("conversation-a")],
      nextCursor: null,
    });
    await reading;
    expect(store.getState().inbox.conversations).toEqual({});
    expect(selectActiveConversation(store.getState())).toBeUndefined();
    expect(selectMessages(store.getState(), "conversation-a")).toEqual([]);
  });
});

describe("history read retries", () => {
  it("retries a failed continuation at the cursor it failed on and clears the marker", async () => {
    let fail = true;
    const latest = { ...incomingMessage("conversation-a"), sequence: 2 };
    const older = { ...latest, id: "older-message", sequence: 1 };
    const olderReads: string[] = [];
    const store = testStore({
      listMessages: async ({ conversationId, cursor }) => {
        if (conversationId !== "conversation-a")
          return { items: [incomingMessage(conversationId)], nextCursor: null };
        if (cursor) olderReads.push(cursor);
        if (cursor && fail)
          throw new DeskApiError("business", "暂时无法读取更早消息", 50001);
        return cursor
          ? { items: [older], nextCursor: null }
          : { items: [latest], nextCursor: "older-page" };
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a", true));
    expect(store.getState().inbox.histories["conversation-a"]).toMatchObject({
      status: "error",
      failedRead: "more",
      nextCursor: "older-page",
    });

    fail = false;
    await store.dispatch(retryHistory("conversation-a"));

    expect(olderReads).toEqual(["older-page", "older-page"]);
    const retried = store.getState().inbox.histories["conversation-a"];
    expect(retried.failedRead).toBeUndefined();
    expect(retried).toMatchObject({ status: "ready", nextCursor: null });
    expect(selectMessages(store.getState(), "conversation-a")).toEqual([
      older,
      latest,
    ]);
  });

  it("retries a failed first read from the first page and clears the marker", async () => {
    let calls = 0;
    const store = testStore({
      listMessages: async ({ conversationId }) => {
        calls += 1;
        if (calls === 1)
          throw new DeskApiError("business", "暂时无法读取消息", 50001);
        return { items: [incomingMessage(conversationId)], nextCursor: null };
      },
    });
    await store.dispatch(loadConversations());
    expect(store.getState().inbox.histories["conversation-a"]).toMatchObject({
      status: "error",
      failedRead: "refresh",
    });

    await store.dispatch(retryHistory("conversation-a"));

    expect(calls).toBe(2);
    const retried = store.getState().inbox.histories["conversation-a"];
    expect(retried.failedRead).toBeUndefined();
    expect(retried).toMatchObject({
      status: "ready",
      hasLoaded: true,
      nextCursor: null,
    });
    expect(selectMessages(store.getState(), "conversation-a")).toEqual([
      incomingMessage("conversation-a"),
    ]);
  });
});
