import { describe, expect, it } from "vitest";
import { defineConversation } from "../test-fixtures";
import type { Conversation } from "../types";
import { buildReplySubmission, replyReadiness } from "./pipeline";

const NOW = "2026-09-16T00:01:00Z";

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return defineConversation({
    id: "conversation-a",
    identity: {
      id: "visitor-a",
      externalUserId: "external-a",
      channelId: "wechat-kf",
      channelName: "微信客服",
      accountId: "account-a",
      accountName: "品牌旗舰店",
    },
    ...overrides,
  });
}

describe("Reply pipeline readiness", () => {
  it("is sendable for plain text on an allowed conversation", () => {
    expect(
      replyReadiness({
        conversation: conversation(),
        connection: "connected",
        text: "你好",
        sending: false,
      }),
    ).toEqual({ sendable: true, notice: null });
  });

  it("blocks empty drafts silently", () => {
    expect(
      replyReadiness({
        conversation: conversation(),
        connection: "connected",
        text: "   ",
        sending: false,
      }),
    ).toEqual({ sendable: false, notice: null });
  });

  it("blocks while sending silently", () => {
    expect(
      replyReadiness({
        conversation: conversation(),
        connection: "connected",
        text: "你好",
        sending: true,
      }),
    ).toEqual({ sendable: false, notice: null });
  });

  it("reports the restriction for closed conversations", () => {
    const readiness = replyReadiness({
      conversation: conversation({ status: "closed" }),
      connection: "connected",
      text: "你好",
      sending: false,
    });
    expect(readiness.sendable).toBe(false);
    expect(readiness.notice).toBe("本次接待已结束");
  });

  it("reports the restriction while disconnected", () => {
    const readiness = replyReadiness({
      conversation: conversation(),
      connection: "disconnected",
      text: "你好",
      sending: false,
    });
    expect(readiness).toEqual({
      sendable: false,
      notice: "接待服务未连接，回复暂不可用",
    });
  });

  it("reports the restriction when text capability is missing", () => {
    const readiness = replyReadiness({
      conversation: conversation({
        capability: { state: "allowed", kinds: [] },
      }),
      connection: "connected",
      text: "你好",
      sending: false,
    });
    expect(readiness.sendable).toBe(false);
    expect(readiness.notice).toBe("当前会话不支持此类回复");
  });
});

describe("Reply pipeline submission builder", () => {
  it("builds a text message one sequence past the max", () => {
    const { message, submission } = buildReplySubmission({
      conversation: conversation(),
      text: "你好",
      draftRevision: 3,
      textRevision: 2,
      maxSequence: 7,
      incomingSequence: 7,
      selectionRevision: 1,
      clientRequestId: "request-1",
      now: NOW,
      next: false,
    });
    expect(message).toMatchObject({
      id: "client:request-1",
      conversationId: "conversation-a",
      direction: "outgoing",
      body: { type: "text", text: "你好" },
      sequence: 8,
      delivery: { state: "sending" },
    });
    expect(submission).toMatchObject({
      messageId: "client:request-1",
      draftRevision: 3,
      textRevision: 2,
      incomingSequence: 7,
      selectionRevision: 1,
      next: false,
      status: "sending",
    });
    expect(submission.request.target.conversationId).toBe("conversation-a");
  });
});
