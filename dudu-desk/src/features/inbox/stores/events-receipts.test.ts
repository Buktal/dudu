import { describe, expect, it } from "vitest";
import { DeskApiError } from "@/lib/api-response";
import type { InboxApi } from "../api";
import type { InboxMessage, SendSubmission } from "../types";
import { loadConversations } from "./queue";
import { loadHistory } from "./reading";
import { selectMessages } from "./selectors";
import { editDraft, sendReply } from "./sending";
import {
  acceptedMessage,
  deferred,
  incomingMessage,
  testStore,
} from "./test-support";

type Subscription = Parameters<InboxApi["subscribe"]>[0];

describe("receipt correlation across response ordering", () => {
  it("collapses an initially uncorrelated server message into the local reply and restores server sequence order", async () => {
    let input!: Subscription;
    let submission!: SendSubmission;
    const pending = deferred<InboxMessage>();
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      send: (request) => {
        submission = request;
        return pending.promise;
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "同一条回复"));
    const sending = store.dispatch(sendReply("conversation-a"));
    const accepted = { ...acceptedMessage(submission), sequence: 6 };
    input.onEvent({
      type: "message",
      context: input.context,
      message: {
        ...incomingMessage("conversation-a"),
        id: "between-message",
        sequence: 4,
      },
    });
    input.onEvent({
      type: "message",
      context: input.context,
      message: {
        ...accepted,
        clientRequestId: undefined,
        version: 2,
        delivery: { state: "sent" },
      },
    });
    pending.resolve(accepted);
    await sending;
    const messages = selectMessages(store.getState(), "conversation-a");
    expect(messages.map((message) => message.sequence)).toEqual([1, 4, 6]);
    expect(messages[2]).toMatchObject({
      id: `client:${submission.clientRequestId}`,
      serverId: accepted.id,
      delivery: { state: "sent" },
    });
    expect(Object.values(store.getState().inbox.messages)).toHaveLength(3);
  });

  it("retains a newer definite failure when an older acceptance response arrives", async () => {
    let input!: Subscription;
    let submission!: SendSubmission;
    const pending = deferred<InboxMessage>();
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      send: (request) => {
        submission = request;
        return pending.promise;
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "保留失败内容"));
    const sending = store.dispatch(sendReply("conversation-a", true));
    input.onEvent({
      type: "message",
      context: input.context,
      message: {
        ...acceptedMessage(submission),
        version: 3,
        sequence: 3,
        delivery: { state: "failed", reason: "渠道明确拒绝" },
      },
    });
    pending.resolve(acceptedMessage(submission));
    await sending;
    const message = selectMessages(store.getState(), "conversation-a")[1];
    expect(message.delivery).toEqual({
      state: "failed",
      reason: "渠道明确拒绝",
    });
    expect(store.getState().inbox.submissions[message.id].status).toBe(
      "failed",
    );
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe(
      "保留失败内容",
    );
    expect(store.getState().inbox.replyId).toBe("conversation-a");
  });

  it("retains a server-confirmed result and later draft edits when the original HTTP request fails", async () => {
    let input!: Subscription;
    let submission!: SendSubmission;
    const pending = deferred<InboxMessage>();
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      send: (request) => {
        submission = request;
        return pending.promise;
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "已发送内容"));
    const sending = store.dispatch(sendReply("conversation-a", true));
    store.dispatch(editDraft("conversation-a", "之后继续输入"));
    input.onEvent({
      type: "message",
      context: input.context,
      message: {
        ...acceptedMessage(submission),
        version: 3,
        sequence: 3,
        delivery: { state: "sent" },
      },
    });
    pending.reject(new DeskApiError("business", "过期请求的拒绝响应"));
    await sending;
    const message = selectMessages(store.getState(), "conversation-a")[1];
    expect(message.delivery?.state).toBe("sent");
    expect(store.getState().inbox.submissions[message.id].status).toBe(
      "accepted",
    );
    expect(store.getState().inbox.drafts["conversation-a"].text).toBe(
      "之后继续输入",
    );
    expect(store.getState().inbox.replyId).toBe("conversation-a");
    expect(store.getState().inbox.notice).toBeNull();
  });
});

describe("local failure evidence for a rejected send", () => {
  async function failedReplyStore(
    submission: (request: SendSubmission) => void,
  ) {
    let input!: Subscription;
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      send: (request) => {
        submission(request);
        return Promise.reject(new DeskApiError("business", "渠道明确拒绝"));
      },
    });
    await store.dispatch(loadConversations());
    await store.dispatch(loadHistory("conversation-a"));
    store.dispatch(editDraft("conversation-a", "本地判失败的回复"));
    await store.dispatch(sendReply("conversation-a"));
    return { input, store };
  }

  it("keeps the failed annotation when a later server frame arrives without delivery", async () => {
    let submission!: SendSubmission;
    const { input, store } = await failedReplyStore((request) => {
      submission = request;
    });
    const failedId = `client:${submission.clientRequestId}`;
    expect(selectMessages(store.getState(), "conversation-a")[1]).toMatchObject(
      {
        delivery: { state: "failed", reason: "渠道明确拒绝" },
      },
    );
    input.onEvent({
      type: "message",
      context: input.context,
      // version 1 的服务端帧不带 delivery：缺失按无发送结果接受
      message: {
        ...acceptedMessage(submission),
        version: 1,
        delivery: undefined,
      },
    });
    const merged = selectMessages(store.getState(), "conversation-a")[1];
    // 服务端快照胜出，但本地失败证据不丢：失败标注与重试入口保留
    expect(merged.version).toBe(1);
    expect(merged.delivery).toEqual({
      state: "failed",
      reason: "渠道明确拒绝",
    });
    expect(store.getState().inbox.submissions[failedId].status).toBe("failed");
  });

  it("keeps the failed annotation when no server frame ever arrives", async () => {
    let submission!: SendSubmission;
    const { store } = await failedReplyStore((request) => {
      submission = request;
    });
    expect(selectMessages(store.getState(), "conversation-a")[1]).toMatchObject(
      {
        delivery: { state: "failed", reason: "渠道明确拒绝" },
      },
    );
    expect(
      store.getState().inbox.submissions[`client:${submission.clientRequestId}`]
        .status,
    ).toBe("failed");
  });

  it("lets a later server frame's delivery evidence override the local failure", async () => {
    let submission!: SendSubmission;
    const { input, store } = await failedReplyStore((request) => {
      submission = request;
    });
    input.onEvent({
      type: "message",
      context: input.context,
      // version 1 的服务端证据胜过 version 0 的本地失败证据
      message: { ...acceptedMessage(submission), version: 1 },
    });
    const merged = selectMessages(store.getState(), "conversation-a")[1];
    expect(merged.delivery).toEqual({ state: "sent" });
    expect(store.getState().inbox.submissions[merged.id].status).toBe(
      "accepted",
    );
  });
});
