import { describe, expect, it } from "vitest";
import { DeskApiError } from "@/lib/api-response";
import type { InboxMessage, ReplyCapability, SendSubmission } from "../types";
import { loadConversations } from "./queue";
import { loadHistory, selectConversation } from "./reading";
import { selectMessages } from "./selectors";
import { editDraft, retryReply, sendReply } from "./sending";
import {
  acceptedMessage,
  deferred,
  firstConversation,
  incomingMessage,
  testStore,
} from "./test-support";

/**
 * 回复提交流：草稿隔离、重复提交去重、失败重试与能力拦截。
 * 发送结果的落定语义见 sending-settlement.test.ts，接待推进见
 * sending-reception.test.ts。
 */
describe("replies through the inbox workflow", () => {
  it("keeps same-name visitors' drafts and immutable send targets separate", async () => {
    const received: string[] = [];
    const store = testStore({
      send: async (input) => {
        received.push(`${input.target.conversationId}:${input.text}`);
        return {
          id: "server-a",
          clientRequestId: input.clientRequestId,
          conversationId: input.target.conversationId,
          direction: "outgoing",
          body: { type: "text", text: input.text },
          createdAt: "2026-09-16T00:01:00Z",
          sequence: 2,
          version: 1,
          delivery: { state: "sent" },
        };
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "给旗舰店的回复"));
    await store.dispatch(selectConversation("conversation-b"));
    store.dispatch(editDraft("conversation-b", "给海外服务的回复"));
    await store.dispatch(sendReply("conversation-a"));
    expect(received).toEqual(["conversation-a:给旗舰店的回复"]);
    expect(store.getState().inbox.drafts["conversation-b"].text).toBe(
      "给海外服务的回复",
    );
    expect(
      selectMessages(store.getState(), "conversation-a")[1].delivery?.state,
    ).toBe("sent");
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
    expect(retried?.delivery?.state).toBe("sent");
  });

  it("retries a failed message loaded from history without a local submission", async () => {
    const submissions: SendSubmission[] = [];
    const failedFromHistory: InboxMessage = {
      id: "server-failed",
      clientRequestId: "client-history",
      conversationId: "conversation-a",
      direction: "outgoing",
      body: { type: "text", text: "历史里的失败内容" },
      createdAt: "2026-09-16T00:01:00Z",
      sequence: 2,
      version: 1,
      delivery: { state: "failed", reason: "渠道明确拒绝" },
    };
    const store = testStore({
      listMessages: async () => ({
        items: [incomingMessage("conversation-a"), failedFromHistory],
        nextCursor: null,
      }),
      send: async (input) => {
        submissions.push(input);
        return acceptedMessage(input);
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    // 重登/他端加载的失败消息没有本地提交记录
    expect(
      store.getState().inbox.submissions[failedFromHistory.id],
    ).toBeUndefined();

    await store.dispatch(retryReply(failedFromHistory.id));

    expect(submissions).toHaveLength(1);
    expect(submissions[0].target.conversationId).toBe("conversation-a");
    expect(submissions[0].text).toBe("历史里的失败内容");
    expect(submissions[0].clientRequestId).not.toBe("client-history");
    const messages = selectMessages(store.getState(), "conversation-a");
    // 原失败记录保留，重发按新消息处理
    expect(
      messages.find((item) => item.id === failedFromHistory.id),
    ).toMatchObject({ delivery: { state: "failed", reason: "渠道明确拒绝" } });
    expect(
      messages.filter((item) => item.direction === "outgoing"),
    ).toHaveLength(2);
  });

  it("does not consume the current draft when retrying a history failure", async () => {
    const failedFromHistory: InboxMessage = {
      id: "server-failed",
      conversationId: "conversation-a",
      direction: "outgoing",
      body: { type: "text", text: "很久以前的失败回复" },
      createdAt: "2026-09-16T00:01:00Z",
      sequence: 2,
      version: 1,
      delivery: { state: "failed", reason: "渠道明确拒绝" },
    };
    const store = testStore({
      listMessages: async () => ({
        items: [incomingMessage("conversation-a"), failedFromHistory],
        nextCursor: null,
      }),
      send: async (input) => acceptedMessage(input),
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "正在写的新草稿"));
    await store.dispatch(retryReply(failedFromHistory.id));

    expect(store.getState().inbox.drafts["conversation-a"].text).toBe(
      "正在写的新草稿",
    );
  });

  it.each<ReplyCapability>([
    { state: "restricted", kinds: ["text"], reason: "渠道权限不足" },
    { state: "allowed", kinds: ["image"] },
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
});
