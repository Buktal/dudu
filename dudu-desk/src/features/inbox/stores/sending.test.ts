import { describe, expect, it } from "vitest";
import { DeskApiError } from "@/lib/api-response";
import type { InboxMessage, ReplyCapability, SendSubmission } from "../types";
import { loadConversations } from "./queue";
import { loadHistory, resetContext, selectConversation } from "./reading";
import { selectMessages } from "./selectors";
import { editDraft, endReception, retryReply, sendReply } from "./sending";
import {
  acceptedMessage,
  deferred,
  firstConversation,
  testStore,
} from "./test-support";

describe("replies through the inbox workflow", () => {
  it("keeps same-name visitors' drafts and immutable send targets separate", async () => {
    const received: string[] = [];
    const store = testStore({
      send: async (input) => {
        received.push(
          `${input.target.accountId}:${input.target.externalUserId}:${input.text}`,
        );
        return {
          id: "server-a",
          clientRequestId: input.clientRequestId,
          conversationId: input.target.conversationId,
          direction: "outgoing",
          body: { type: "text", text: input.text },
          createdAt: "2026-09-16T00:01:00Z",
          sequence: 2,
          version: 1,
          delivery: { state: "accepted" },
        };
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "给旗舰店的回复"));
    await store.dispatch(selectConversation("conversation-b"));
    store.dispatch(editDraft("conversation-b", "给海外服务的回复"));
    await store.dispatch(sendReply("conversation-a"));
    expect(received).toEqual(["account-a:external-a:给旗舰店的回复"]);
    expect(store.getState().inbox.drafts["conversation-b"].text).toBe(
      "给海外服务的回复",
    );
    expect(
      selectMessages(store.getState(), "conversation-a")[1].delivery?.state,
    ).toBe("accepted");
    expect(store.getState().inbox.replyId).toBe("conversation-b");
  });

  it("ignores duplicate submit, preserves newer edits and does not advance after the agent changes target", async () => {
    const pending = deferred<InboxMessage>();
    const submissions: SendSubmission[] = [];
    const store = testStore({
      send: async (input) => {
        submissions.push(input);
        return pending.promise;
      },
    });
    await store.dispatch(loadConversations());
    store.dispatch(editDraft("conversation-a", "第一份回复"));
    const sending = store.dispatch(sendReply("conversation-a", true));
    await store.dispatch(sendReply("conversation-a", true));
    store.dispatch(editDraft("conversation-a", "我还在编辑的新内容"));
    await store.dispatch(selectConversation("conversation-b"));
    pending.resolve(acceptedMessage(submissions[0]));
    await sending;
    expect(submissions).toHaveLength(1);
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe(
      "我还在编辑的新内容",
    );
    expect(store.getState().inbox.replyId).toBe("conversation-b");
  });

  it("retries a definite failure using the original content, target and correlation id", async () => {
    const submissions: SendSubmission[] = [];
    const store = testStore({
      send: async (input) => {
        submissions.push(input);
        if (submissions.length === 1)
          throw new DeskApiError("business", "渠道明确拒绝", 50001);
        return acceptedMessage(input);
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "原内容"));
    await store.dispatch(sendReply("conversation-a"));
    const failed = selectMessages(store.getState(), "conversation-a")[1];
    expect(failed.delivery?.state).toBe("failed");
    await store.dispatch(selectConversation("conversation-b"));
    store.dispatch(editDraft("conversation-a", "新的内容"));
    await store.dispatch(retryReply(failed.id));
    expect(submissions[1].target).toEqual(submissions[0].target);
    expect(submissions[1].clientRequestId).toBe(submissions[0].clientRequestId);
    expect(submissions[1].text).toBe("原内容");
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe(
      "新的内容",
    );
    expect(selectMessages(store.getState(), "conversation-a")).toHaveLength(2);
  });

  it("keeps interrupted sends unconfirmed without auto retry or moving to the next visitor", async () => {
    let calls = 0;
    const store = testStore({
      send: async () => {
        calls++;
        throw new TypeError("network lost");
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "等待结果"));
    await store.dispatch(sendReply("conversation-a", true));
    const message = selectMessages(store.getState(), "conversation-a")[1];
    await store.dispatch(retryReply(message.id));
    expect(message.delivery?.state).toBe("unconfirmed");
    expect(calls).toBe(1);
    expect(store.getState().inbox.activeId).toBe("conversation-a");
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe(
      "等待结果",
    );
  });

  it("only advances after explicit send-and-next acceptance and never ends reception implicitly", async () => {
    let ends = 0;
    const store = testStore({
      send: async (input) => acceptedMessage(input),
      endConversation: async () => {
        ends++;
        return { ...firstConversation, status: "closed" };
      },
    });
    await store.dispatch(loadConversations());
    store.dispatch(editDraft("conversation-a", "普通发送"));
    await store.dispatch(sendReply("conversation-a"));
    expect(store.getState().inbox.activeId).toBe("conversation-a");
    store.dispatch(editDraft("conversation-a", "发送再下一位"));
    await store.dispatch(sendReply("conversation-a", true));
    expect(store.getState().inbox.activeId).toBe("conversation-b");
    expect(ends).toBe(0);
    expect(store.getState().inbox.conversations["conversation-a"].status).toBe(
      "needs-reply",
    );
  });

  it.each<ReplyCapability>([
    { state: "unknown", kinds: [] },
    { state: "restricted", kinds: ["text"], reason: "渠道权限不足" },
    { state: "allowed", kinds: ["image"] },
    { state: "allowed", kinds: ["text"], expiresAt: "2026-09-15T00:00:00Z" },
    { state: "allowed", kinds: ["text"], expiresAt: "not-a-time" },
    { state: "allowed", kinds: ["text"], expiresAt: "" },
    { state: "allowed", kinds: ["text"], remaining: 0 },
  ])(
    "blocks a send outside the current reply capability: %j",
    async (capability) => {
      let calls = 0;
      const store = testStore({
        listConversations: async () => ({
          items: [{ ...firstConversation, capability }],
          nextCursor: null,
        }),
        send: async (input) => {
          calls++;
          return acceptedMessage(input);
        },
      });
      await store.dispatch(loadConversations());
      store.dispatch(editDraft("conversation-a", "未提交的回复"));
      await store.dispatch(sendReply("conversation-a"));
      expect(calls).toBe(0);
      expect(store.getState().inbox.drafts["conversation-a"].text).toBe(
        "未提交的回复",
      );
      expect(store.getState().inbox.notice).toBeTruthy();
    },
  );

  it("rejects late send and end responses after a context change", async () => {
    const pending = deferred<InboxMessage>();
    const ending = deferred<typeof firstConversation>();
    let submission: SendSubmission | undefined;
    const store = testStore({
      send: async (input) => {
        submission = input;
        return pending.promise;
      },
      endConversation: () => ending.promise,
    });
    await store.dispatch(loadConversations());
    store.dispatch(editDraft("conversation-a", "旧上下文"));
    const sending = store.dispatch(sendReply("conversation-a"));
    const closing = store.dispatch(endReception("conversation-a"));
    store.dispatch(
      resetContext({ agentId: "other-agent", workspaceId: "other-workspace" }),
    );
    expect(submission).toBeDefined();
    if (submission) pending.resolve(acceptedMessage(submission));
    ending.resolve({ ...firstConversation, status: "closed", version: 2 });
    await Promise.all([sending, closing]);
    expect(store.getState().inbox.drafts).toEqual({});
    expect(store.getState().inbox.messages).toEqual({});
    expect(store.getState().inbox.conversations).toEqual({});
  });

  it("only shows reception as ended after the API confirms it", async () => {
    let fail = true;
    const store = testStore({
      endConversation: async () => {
        if (fail) throw new DeskApiError("business", "结束接待未保存");
        return {
          ...firstConversation,
          version: 2,
          status: "closed",
          capability: {
            state: "restricted",
            kinds: [],
            reason: "本次接待已结束",
          },
        };
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(endReception("conversation-a"));
    expect(store.getState().inbox.conversations["conversation-a"].status).toBe(
      "needs-reply",
    );
    fail = false;
    await store.dispatch(endReception("conversation-a"));
    expect(store.getState().inbox.conversations["conversation-a"].status).toBe(
      "closed",
    );
    expect(store.getState().inbox.conversations["conversation-a"].unread).toBe(
      1,
    );
  });
});
