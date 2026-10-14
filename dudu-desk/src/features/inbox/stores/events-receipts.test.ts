import { describe, expect, it } from "vitest";
import { DeskApiError } from "@/lib/api-response";
import type { InboxApi } from "../api";
import type { Conversation, InboxMessage, SendSubmission } from "../types";
import { addAttachments } from "./attachments";
import { loadConversations } from "./queue";
import { loadHistory } from "./reading";
import { selectMessages } from "./selectors";
import { editDraft, sendReply } from "./sending";
import {
  acceptedMessage,
  deferred,
  firstConversation,
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

  it("keeps a newer send locked and preserves its later draft when an older server confirmation settles shared attachments", async () => {
    let input!: Subscription;
    const submissions: SendSubmission[] = [];
    const pending = deferred<InboxMessage>();
    const conversation: Conversation = {
      ...firstConversation,
      capability: {
        state: "allowed",
        kinds: ["text", "file"],
      },
    };
    const store = testStore({
      subscribe: (subscription) => {
        input = subscription;
        input.onConnection("connected");
        return () => {};
      },
      listConversations: async () => ({
        items: [conversation],
        nextCursor: null,
      }),
      prepareAttachment: async ({ file }) => ({
        id: `prepared:${file.name}`,
        kind: "file",
        name: file.name,
        mimeType: file.type,
        size: file.size,
      }),
      send: async (request) => {
        submissions.push(request);
        if (submissions.length === 1)
          throw new TypeError("first response lost");
        return pending.promise;
      },
    });
    await store.dispatch(loadConversations());
    store.dispatch(editDraft("conversation-a", "第一条回复"));
    await store.dispatch(
      addAttachments("conversation-a", [
        new File(["old"], "old.txt", { type: "text/plain" }),
      ]),
    );
    await store.dispatch(sendReply("conversation-a"));
    store.dispatch(editDraft("conversation-a", "第二条回复"));
    const sending = store.dispatch(sendReply("conversation-a"));
    const activeMessageId = `client:${submissions[1].clientRequestId}`;
    store.dispatch(editDraft("conversation-a", "第二条发送期间的新稿"));
    await store.dispatch(
      addAttachments("conversation-a", [
        new File(["new"], "new.txt", { type: "text/plain" }),
      ]),
    );
    const newestAttachmentId =
      store.getState().inbox.drafts["conversation-a"].attachmentIds[1];
    input.onEvent({
      type: "message",
      context: input.context,
      message: {
        ...acceptedMessage(submissions[0]),
        version: 3,
        sequence: 3,
        delivery: { state: "sent" },
      },
    });
    expect(store.getState().inbox.sendingByConversation["conversation-a"]).toBe(
      activeMessageId,
    );
    expect(store.getState().inbox.submissions[activeMessageId].status).toBe(
      "sending",
    );
    expect(store.getState().inbox.drafts["conversation-a"]).toMatchObject({
      text: "第二条发送期间的新稿",
      attachmentIds: [newestAttachmentId],
    });
    await store.dispatch(sendReply("conversation-a"));
    expect(submissions).toHaveLength(2);
    pending.resolve({ ...acceptedMessage(submissions[1]), sequence: 3 });
    await sending;
    expect(
      store.getState().inbox.sendingByConversation["conversation-a"],
    ).toBeUndefined();
    expect(store.getState().inbox.drafts["conversation-a"]).toMatchObject({
      text: "第二条发送期间的新稿",
      attachmentIds: [newestAttachmentId],
    });
  });
});
