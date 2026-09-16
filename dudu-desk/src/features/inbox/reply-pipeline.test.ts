import { describe, expect, it } from "vitest";
import { defineConversation } from "./fixtures";
import { replyReadiness } from "./reply-pipeline";
import type { Conversation } from "./types";

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
    capability: {
      state: "allowed",
      kinds: ["text", "image", "file", "audio", "video"],
      attachments: {
        maxBytes: 20 * 1024 * 1024,
        maxCount: 4,
        mimeTypes: ["image/*", "text/plain"],
      },
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
        files: [],
        sending: false,
        now: NOW,
      }),
    ).toEqual({ sendable: true, notice: null });
  });

  it("blocks empty drafts silently", () => {
    expect(
      replyReadiness({
        conversation: conversation(),
        connection: "connected",
        text: "   ",
        files: [],
        sending: false,
        now: NOW,
      }),
    ).toEqual({ sendable: false, notice: null });
  });

  it("blocks while sending silently", () => {
    expect(
      replyReadiness({
        conversation: conversation(),
        connection: "connected",
        text: "你好",
        files: [],
        sending: true,
        now: NOW,
      }),
    ).toEqual({ sendable: false, notice: null });
  });

  it("reports the restriction for closed conversations", () => {
    const readiness = replyReadiness({
      conversation: conversation({ status: "closed" }),
      connection: "connected",
      text: "你好",
      files: [],
      sending: false,
      now: NOW,
    });
    expect(readiness.sendable).toBe(false);
    expect(readiness.notice).toBe("本次接待已结束");
  });

  it("reports the restriction while disconnected", () => {
    const readiness = replyReadiness({
      conversation: conversation(),
      connection: "disconnected",
      text: "你好",
      files: [],
      sending: false,
      now: NOW,
    });
    expect(readiness).toEqual({
      sendable: false,
      notice: "接待服务未连接，回复暂不可用",
    });
  });

  it("waits for preparing attachments with one notice", () => {
    expect(
      replyReadiness({
        conversation: conversation(),
        connection: "connected",
        text: "见图",
        files: [
          {
            name: "a.png",
            size: 10,
            mimeType: "image/png",
            status: "preparing",
          },
        ],
        sending: false,
        now: NOW,
      }),
    ).toEqual({
      sendable: false,
      notice: "请等待附件准备完成，或移除失败附件",
    });
  });

  it("waits for failed attachments with the same notice", () => {
    const readiness = replyReadiness({
      conversation: conversation(),
      connection: "connected",
      text: "",
      files: [
        {
          name: "a.png",
          size: 10,
          mimeType: "image/png",
          status: "failed",
        },
      ],
      sending: false,
      now: NOW,
    });
    expect(readiness.sendable).toBe(false);
    expect(readiness.notice).toBe("请等待附件准备完成，或移除失败附件");
  });

  it("treats ready status without media as not ready", () => {
    const readiness = replyReadiness({
      conversation: conversation(),
      connection: "connected",
      text: "",
      files: [
        {
          name: "a.png",
          size: 10,
          mimeType: "image/png",
          status: "ready",
        },
      ],
      sending: false,
      now: NOW,
    });
    expect(readiness.sendable).toBe(false);
    expect(readiness.notice).toBe("请等待附件准备完成，或移除失败附件");
  });

  it("is sendable for an attachment-only draft once prepared", () => {
    expect(
      replyReadiness({
        conversation: conversation(),
        connection: "connected",
        text: "",
        files: [
          {
            name: "a.png",
            size: 10,
            mimeType: "image/png",
            status: "ready",
            media: { id: "m1" },
          },
        ],
        sending: false,
        now: NOW,
      }),
    ).toEqual({ sendable: true, notice: null });
  });
});
