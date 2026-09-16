import { describe, expect, it } from "vitest";
import { DeskApiError } from "@/lib/api-response";
import type { Conversation, InboxEvent } from "../types";
import { loadConversations, resetContext } from "./reading";
import { editDraft, endReception, resumeReception } from "./sending";
import { emptyQuery } from "./state";
import { deferred, firstConversation, testStore } from "./test-support";

describe("reception commands", () => {
  it("continues a closed reception only after confirmation and retains its draft", async () => {
    const pending = deferred<Conversation>();
    const closed: Conversation = {
      ...firstConversation,
      status: "closed",
      version: 2,
    };
    const store = testStore({
      listConversations: async () => ({ items: [closed], nextCursor: null }),
      resumeConversation: () => pending.promise,
    });
    await store.dispatch(
      loadConversations({ query: { ...emptyQuery, status: "closed" } }),
    );
    store.dispatch(editDraft("conversation-a", "继续确认配送时间"));

    const resuming = store.dispatch(resumeReception("conversation-a"));
    expect(store.getState().inbox.conversations["conversation-a"].status).toBe(
      "closed",
    );
    expect(store.getState().inbox.ending["conversation-a"].status).toBe(
      "saving",
    );
    pending.resolve({ ...closed, status: "needs-reply", version: 3 });
    await resuming;

    const state = store.getState().inbox;
    expect({
      status: state.conversations["conversation-a"].status,
      draft: state.drafts["conversation-a"].text,
      saving: state.ending["conversation-a"].status,
      replyId: state.replyId,
    }).toEqual({
      status: "needs-reply",
      draft: "继续确认配送时间",
      saving: "saved",
      replyId: "conversation-a",
    });
  });

  it("rejects a resume confirmation for a different conversation", async () => {
    const closed: Conversation = {
      ...firstConversation,
      status: "closed",
      version: 2,
    };
    const store = testStore({
      listConversations: async () => ({ items: [closed], nextCursor: null }),
      resumeConversation: async () => ({
        ...closed,
        id: "another-conversation",
        status: "needs-reply",
        version: 3,
      }),
    });
    await store.dispatch(loadConversations());
    await store.dispatch(resumeReception("conversation-a"));

    const state = store.getState().inbox;
    expect(state.ending["conversation-a"]).toMatchObject({
      status: "error",
      error: { kind: "invalid-response" },
    });
    expect(state.conversations["conversation-a"].status).toBe("closed");
    expect(state.conversations["another-conversation"]).toBeUndefined();
  });

  it("keeps reception closed when the service does not confirm an active status", async () => {
    const closed: Conversation = {
      ...firstConversation,
      status: "closed",
      version: 2,
    };
    const store = testStore({
      listConversations: async () => ({ items: [closed], nextCursor: null }),
      resumeConversation: async () => ({ ...closed, version: 3 }),
    });
    await store.dispatch(loadConversations());
    await store.dispatch(resumeReception("conversation-a"));

    const state = store.getState().inbox;
    expect(state.ending["conversation-a"]).toMatchObject({
      status: "error",
      error: { kind: "invalid-response" },
    });
    expect(state.conversations["conversation-a"].status).toBe("closed");
    expect(state.notice?.message).toBe("服务未确认本次接待已恢复");
  });

  it("cancels a resume when its conversation disappears and ignores the late confirmation", async () => {
    const pending = deferred<Conversation>();
    let receive: ((event: InboxEvent) => void) | undefined;
    let signal: AbortSignal | undefined;
    const closed: Conversation = {
      ...firstConversation,
      status: "closed",
      version: 2,
    };
    const store = testStore({
      subscribe: (input) => {
        receive = input.onEvent;
        input.onConnection("connected");
        return () => {};
      },
      listConversations: async () => ({ items: [closed], nextCursor: null }),
      resumeConversation: (input) => {
        signal = input.signal;
        return pending.promise;
      },
    });
    await store.dispatch(loadConversations());
    const resuming = store.dispatch(resumeReception("conversation-a"));
    receive?.({
      context: { agentId: "agent-a", workspaceId: "workspace-a" },
      id: "removed-a",
      cursor: "1",
      type: "removed",
      conversationId: "conversation-a",
      version: 3,
    });

    expect(signal?.aborted).toBe(true);
    pending.resolve({ ...closed, status: "needs-reply", version: 4 });
    await resuming;
    expect(
      store.getState().inbox.conversations["conversation-a"],
    ).toBeUndefined();
  });

  it("does not report resumed when a newer server event has closed reception again", async () => {
    const pending = deferred<Conversation>();
    let receive: ((event: InboxEvent) => void) | undefined;
    const closed: Conversation = {
      ...firstConversation,
      status: "closed",
      version: 2,
    };
    const store = testStore({
      subscribe: (input) => {
        receive = input.onEvent;
        input.onConnection("connected");
        return () => {};
      },
      listConversations: async () => ({ items: [closed], nextCursor: null }),
      resumeConversation: () => pending.promise,
    });
    await store.dispatch(loadConversations());
    const resuming = store.dispatch(resumeReception("conversation-a"));
    receive?.({
      context: { agentId: "agent-a", workspaceId: "workspace-a" },
      id: "closed-again-a",
      cursor: "1",
      type: "conversation",
      conversation: { ...closed, version: 4 },
    });
    pending.resolve({ ...closed, status: "needs-reply", version: 3 });
    await resuming;

    const state = store.getState().inbox;
    expect(state.conversations["conversation-a"]).toMatchObject({
      status: "closed",
      version: 4,
    });
    expect(state.ending["conversation-a"]).toMatchObject({
      status: "error",
      error: { kind: "invalid-response" },
    });
    expect(state.notice?.message).toBe("服务未确认本次接待已恢复");
  });

  it("aborts a resume when the work context changes and ignores its late result", async () => {
    const pending = deferred<Conversation>();
    let signal: AbortSignal | undefined;
    const store = testStore({
      listConversations: async () => ({
        items: [{ ...firstConversation, status: "closed", version: 2 }],
        nextCursor: null,
      }),
      resumeConversation: (input) => {
        signal = input.signal;
        return pending.promise;
      },
    });
    await store.dispatch(loadConversations());
    const resuming = store.dispatch(resumeReception("conversation-a"));
    store.dispatch(
      resetContext({ agentId: "new-agent", workspaceId: "new-workspace" }),
    );

    expect(signal?.aborted).toBe(true);
    pending.resolve({ ...firstConversation, version: 3 });
    await resuming;
    expect(store.getState().inbox).toMatchObject({
      context: { agentId: "new-agent", workspaceId: "new-workspace" },
      conversations: {},
      ending: {},
      notice: null,
    });
  });

  it("retains a newer draft after a refused resume and allows a confirmed retry", async () => {
    const pending = deferred<Conversation>();
    let attempts = 0;
    const store = testStore({
      listConversations: async () => ({
        items: [{ ...firstConversation, status: "closed", version: 2 }],
        nextCursor: null,
      }),
      resumeConversation: () =>
        ++attempts === 1
          ? pending.promise
          : Promise.resolve({
              ...firstConversation,
              status: "waiting",
              version: 3,
            }),
    });
    await store.dispatch(loadConversations());
    const resuming = store.dispatch(resumeReception("conversation-a"));
    store.dispatch(editDraft("conversation-a", "稍后继续处理的草稿"));
    pending.reject(new DeskApiError("business", "当前账号不能继续接待"));
    await resuming;

    expect(store.getState().inbox.ending["conversation-a"]).toMatchObject({
      status: "error",
      error: { kind: "business", message: "当前账号不能继续接待" },
    });
    expect(store.getState().inbox.conversations["conversation-a"].status).toBe(
      "closed",
    );
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe(
      "稍后继续处理的草稿",
    );

    await store.dispatch(resumeReception("conversation-a"));
    expect(store.getState().inbox.ending["conversation-a"].status).toBe(
      "saved",
    );
    expect(store.getState().inbox.conversations["conversation-a"].status).toBe(
      "waiting",
    );
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe(
      "稍后继续处理的草稿",
    );
  });

  it.each(["closed", "needs-reply", "waiting"] as const)(
    "does not repeat a reception transition already confirmed as %s",
    async (status) => {
      const store = testStore({
        listConversations: async () => ({
          items: [{ ...firstConversation, status }],
          nextCursor: null,
        }),
      });
      await store.dispatch(loadConversations());

      await store.dispatch(
        status === "closed"
          ? endReception("conversation-a")
          : resumeReception("conversation-a"),
      );

      expect(
        store.getState().inbox.conversations["conversation-a"].status,
      ).toBe(status);
      expect(store.getState().inbox.ending["conversation-a"]).toBeUndefined();
      expect(store.getState().inbox.notice).toBeNull();
    },
  );
});
