import { describe, expect, it } from "vitest";
import { DeskApiError } from "@/lib/api-response";
import type { InboxApi } from "../api";
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

  it("retries with the original content and a new correlation id while keeping the failed record", async () => {
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
    // 手动重发按新消息处理：新的 clientRequestId，原失败记录不被覆盖
    expect(submissions[1].clientRequestId).not.toBe(
      submissions[0].clientRequestId,
    );
    expect(submissions[1].text).toBe("原内容");
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe(
      "新的内容",
    );
    const messages = selectMessages(store.getState(), "conversation-a");
    expect(messages).toHaveLength(3);
    expect(messages.find((item) => item.id === failed.id)).toMatchObject({
      delivery: { state: "failed", reason: "渠道明确拒绝" },
    });
    const retried = messages.find(
      (item) => item.id !== failed.id && item.direction === "outgoing",
    );
    expect(retried?.clientRequestId).toBe(submissions[1].clientRequestId);
    expect(retried?.delivery?.state).toBe("accepted");
  });

  it("settles a persisted channel failure as the failed bubble with its real reason", async () => {
    const store = testStore({
      send: async (input) => ({
        ...acceptedMessage(input),
        delivery: {
          state: "failed",
          reason: "微信客服消息发送失败：40001 invalid credential",
        },
      }),
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "稍等，我查一下"));
    await store.dispatch(sendReply("conversation-a"));

    const messages = selectMessages(store.getState(), "conversation-a");
    expect(messages).toHaveLength(2);
    // 渠道失败同样是已保存的持久消息：显示真实原因，不能判成无效响应或结果未确认
    expect(messages[1].delivery).toEqual({
      state: "failed",
      reason: "微信客服消息发送失败：40001 invalid credential",
    });
    expect(store.getState().inbox.submissions[messages[1].id].status).toBe(
      "failed",
    );
    expect(
      store.getState().inbox.sendingByConversation["conversation-a"],
    ).toBeUndefined();
    expect(store.getState().inbox.notice?.kind).not.toBe("unconfirmed-send");
  });

  it("merges the socket result and the HTTP response into one persisted message", async () => {
    const pending = deferred<InboxMessage>();
    let request: SendSubmission | undefined;
    let subscription!: Parameters<InboxApi["subscribe"]>[0];
    const store = testStore({
      subscribe: (input) => {
        subscription = input;
        input.onConnection("connected");
        return () => {};
      },
      send: async (input) => {
        request = input;
        return pending.promise;
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "已受理的回复"));
    const sending = store.dispatch(sendReply("conversation-a"));
    const clientRequestId = request?.clientRequestId ?? "";
    const persisted: InboxMessage = {
      id: "server-9002",
      clientRequestId,
      conversationId: "conversation-a",
      direction: "outgoing",
      body: { type: "text", text: "已受理的回复" },
      createdAt: "2026-09-16T00:01:00Z",
      sequence: 2,
      version: 2,
      delivery: { state: "sent" },
    };

    // Socket 先进：完整消息 + 最新访客摘要；随后 HTTP 返回同一条消息
    subscription.onEvent({
      type: "message",
      context: subscription.context,
      message: persisted,
      conversation: {
        ...firstConversation,
        status: "waiting",
        version: 2,
        messageCount: 2,
        preview: "已受理的回复",
      },
    });
    pending.resolve(persisted);
    await sending;

    const messages = selectMessages(store.getState(), "conversation-a");
    expect(
      messages.filter((message) => message.direction === "outgoing"),
    ).toHaveLength(1);
    expect(messages[1].delivery?.state).toBe("sent");
    expect(
      store.getState().inbox.conversations["conversation-a"],
    ).toMatchObject({
      status: "waiting",
      preview: "已受理的回复",
    });
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe("");
  });

  it("shows the sending bubble without overwriting the persisted summary", async () => {
    const pending = deferred<InboxMessage>();
    let request: SendSubmission | undefined;
    const store = testStore({
      send: async (input) => {
        request = input;
        return pending.promise;
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    const before = store.getState().inbox.conversations["conversation-a"];
    store.dispatch(editDraft("conversation-a", "正在发送的回复"));
    const sending = store.dispatch(sendReply("conversation-a"));

    // 发送中先显示本地气泡；持久摘要与计数等到结果保存后的通知才更新
    expect(selectMessages(store.getState(), "conversation-a")[1]).toMatchObject(
      {
        direction: "outgoing",
        body: { type: "text", text: "正在发送的回复" },
        delivery: { state: "sending" },
      },
    );
    const during = store.getState().inbox.conversations["conversation-a"];
    expect(during.preview).toBe(before.preview);
    expect(during.messageCount).toBe(before.messageCount);
    expect(during.status).toBe(before.status);

    if (request) pending.resolve(acceptedMessage(request));
    await sending;
    expect(store.getState().inbox.conversations["conversation-a"].status).toBe(
      before.status,
    );
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
