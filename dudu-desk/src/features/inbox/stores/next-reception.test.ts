import { describe, expect, it } from "vitest";
import type { InboxEvent, InboxMessage, Page, SendSubmission } from "../types";
import { loadConversations } from "./queue";
import { loadHistory } from "./reading";
import { selectMessages } from "./selectors";
import { editDraft, sendReply } from "./sending";
import { emptyQuery } from "./state";
import {
  acceptedMessage,
  deferred,
  firstConversation,
  incomingMessage,
  secondConversation,
  testStore,
} from "./test-support";

describe("send and receive the next visitor", () => {
  it("finds a replyable visitor beyond the current filter and first candidate page", async () => {
    const third = { ...secondConversation, id: "conversation-c" };
    const store = testStore({
      send: async (input) => acceptedMessage(input),
      listConversations: async ({ query, cursor }) => {
        if (query.search)
          return { items: [firstConversation], nextCursor: null };
        return cursor
          ? { items: [third], nextCursor: null }
          : {
              items: [
                {
                  ...secondConversation,
                  capability: {
                    state: "restricted",
                    kinds: [],
                    reason: "回复窗口已关闭",
                  },
                },
              ],
              nextCursor: "next-candidate-page",
            };
      },
    });
    await store.dispatch(
      loadConversations({ query: { ...emptyQuery, search: "定位当前访客" } }),
    );
    store.dispatch(editDraft("conversation-a", "已为你安排好"));
    await store.dispatch(sendReply("conversation-a", true));

    expect(store.getState().inbox.replyId).toBe("conversation-c");
    expect(store.getState().inbox.queue.query.search).toBe("定位当前访客");
    expect(store.getState().inbox.queue.ids).toEqual(["conversation-a"]);
    expect(
      selectMessages(store.getState(), "conversation-a").slice(-1)[0]?.delivery
        ?.state,
    ).toBe("accepted");
    // The per-message candidate scope is spent once the next visitor is
    // picked; no choices state outlives the search.
    expect(Object.keys(store.getState().inbox.choices)).toEqual([]);
  });

  it("stays with a visitor who sends a follow-up while the reply is being accepted", async () => {
    const response = deferred<InboxMessage>();
    let submitted!: SendSubmission;
    let receive!: (event: InboxEvent) => void;
    const store = testStore({
      subscribe: ({ onConnection, onEvent }) => {
        receive = onEvent;
        onConnection("connected");
        return () => {};
      },
      send: (input) => {
        submitted = input;
        return response.promise;
      },
    });
    await store.dispatch(loadConversations());
    store.dispatch(editDraft("conversation-a", "正在为你处理"));
    const sending = store.dispatch(sendReply("conversation-a", true));
    receive({
      id: "follow-up-event",
      cursor: "follow-up-cursor",
      context: store.getState().inbox.context,
      type: "message",
      message: {
        ...incomingMessage("conversation-a"),
        id: "follow-up-message",
        sequence: 3,
        body: { type: "text", text: "还有一个问题" },
      },
    });
    response.resolve(acceptedMessage(submitted));
    await sending;

    expect(store.getState().inbox.replyId).toBe("conversation-a");
    expect(
      selectMessages(store.getState(), "conversation-a").find(
        (message) => message.direction === "outgoing",
      )?.delivery?.state,
    ).toBe("accepted");
  });

  it("stays with a new follow-up whose history response arrives before its event", async () => {
    const response = deferred<InboxMessage>();
    let submitted!: SendSubmission;
    let receive!: (event: InboxEvent) => void;
    const followUp: InboxMessage = {
      ...incomingMessage("conversation-a"),
      id: "query-first-follow-up",
      sequence: 3,
      body: { type: "text", text: "还有一个问题" },
    };
    let history = [incomingMessage("conversation-a")];
    const store = testStore({
      subscribe: ({ onConnection, onEvent }) => {
        receive = onEvent;
        onConnection("connected");
        return () => {};
      },
      listMessages: async ({ conversationId }) => ({
        items:
          conversationId === "conversation-a"
            ? history
            : [incomingMessage(conversationId)],
        nextCursor: null,
      }),
      send: (input) => {
        submitted = input;
        return response.promise;
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "正在为你处理"));
    const sending = store.dispatch(sendReply("conversation-a", true));
    history = [...history, followUp];
    await store.dispatch(loadHistory("conversation-a"));
    receive({
      id: "query-first-follow-up-event",
      cursor: "query-first-follow-up-cursor",
      context: store.getState().inbox.context,
      type: "message",
      message: followUp,
    });
    response.resolve(acceptedMessage(submitted));
    await sending;

    expect(store.getState().inbox.replyId).toBe("conversation-a");
    expect(
      selectMessages(store.getState(), "conversation-a").find(
        (message) => message.direction === "outgoing",
      )?.delivery?.state,
    ).toBe("accepted");
  });

  it("can advance when a subscription replays an incoming message known before submission", async () => {
    const response = deferred<InboxMessage>();
    let submitted!: SendSubmission;
    let receive!: (event: InboxEvent) => void;
    const store = testStore({
      subscribe: ({ onConnection, onEvent }) => {
        receive = onEvent;
        onConnection("connected");
        return () => {};
      },
      send: (input) => {
        submitted = input;
        return response.promise;
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "已经为你确认"));
    const sending = store.dispatch(sendReply("conversation-a", true));
    receive({
      id: "known-history-event",
      cursor: "known-history-cursor",
      context: store.getState().inbox.context,
      type: "message",
      message: incomingMessage("conversation-a"),
    });
    response.resolve(acceptedMessage(submitted));
    await sending;

    expect(store.getState().inbox.replyId).toBe("conversation-b");
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe("");
  });

  it("can advance when existing history finishes loading after submission without a new event", async () => {
    const response = deferred<InboxMessage>();
    const history = deferred<Page<InboxMessage>>();
    const reading = deferred<void>();
    let submitted!: SendSubmission;
    const store = testStore({
      listMessages: ({ conversationId }) => {
        if (conversationId === "conversation-a") {
          reading.resolve();
          return history.promise;
        }
        return Promise.resolve({
          items: [incomingMessage(conversationId)],
          nextCursor: null,
        });
      },
      send: (input) => {
        submitted = input;
        return response.promise;
      },
    });
    const loading = store.dispatch(loadConversations());
    await reading.promise;
    store.dispatch(editDraft("conversation-a", "已经为你确认"));
    const sending = store.dispatch(sendReply("conversation-a", true));
    history.resolve({
      items: [incomingMessage("conversation-a")],
      nextCursor: null,
    });
    await loading;
    response.resolve(acceptedMessage(submitted));
    await sending;

    expect(store.getState().inbox.replyId).toBe("conversation-b");
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe("");
  });

  it("does not advance if reception ends while the reply is being accepted", async () => {
    const response = deferred<InboxMessage>();
    let submitted!: SendSubmission;
    let receive!: (event: InboxEvent) => void;
    const store = testStore({
      subscribe: ({ onConnection, onEvent }) => {
        receive = onEvent;
        onConnection("connected");
        return () => {};
      },
      send: (input) => {
        submitted = input;
        return response.promise;
      },
    });
    await store.dispatch(loadConversations());
    store.dispatch(editDraft("conversation-a", "回复已安排"));
    const sending = store.dispatch(sendReply("conversation-a", true));
    receive({
      id: "closed-event",
      cursor: "closed-cursor",
      context: store.getState().inbox.context,
      type: "conversation",
      conversation: { ...firstConversation, status: "closed", version: 2 },
    });
    response.resolve(acceptedMessage(submitted));
    await sending;

    expect(store.getState().inbox.replyId).toBe("conversation-a");
    expect(store.getState().inbox.conversations["conversation-a"].status).toBe(
      "closed",
    );
  });

  it("keeps an accepted reply accepted when finding the next visitor fails", async () => {
    const store = testStore({
      send: async (input) => acceptedMessage(input),
      listConversations: async ({ query }) => {
        if (query.status === "needs-reply")
          throw new Error("query interrupted");
        return {
          items: [firstConversation, secondConversation],
          nextCursor: null,
        };
      },
    });
    await store.dispatch(loadConversations());
    store.dispatch(editDraft("conversation-a", "已经为你处理"));
    await store.dispatch(sendReply("conversation-a", true));

    expect(store.getState().inbox.replyId).toBe("conversation-a");
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe("");
    expect(
      selectMessages(store.getState(), "conversation-a").slice(-1)[0]?.delivery
        ?.state,
    ).toBe("accepted");
    expect(store.getState().inbox.notice?.message).toContain(
      "暂时无法获取下一位",
    );
    // The read-failed exit spends the scope the same way.
    expect(Object.keys(store.getState().inbox.choices)).toEqual([]);
  });
});
