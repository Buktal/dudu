import { describe, expect, it } from "vitest";
import { defineConversation } from "./development/fixtures";
import {
  buildReplySubmission,
  replyReadiness,
  replyRestriction,
} from "./reply-pipeline";
import { firstConversation } from "./stores/test-support";
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

describe("Reply pipeline submission builder", () => {
  it("builds a text message one sequence past the max", () => {
    const { message, submission } = buildReplySubmission({
      conversation: conversation(),
      text: "你好",
      draftRevision: 3,
      textRevision: 2,
      draftAttachmentIds: [],
      media: [],
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

  it("builds a reply body carrying the prepared media", () => {
    const media = [
      {
        id: "m1",
        kind: "image" as const,
        name: "a.png",
        mimeType: "image/png",
        size: 10,
      },
    ];
    const { message, submission } = buildReplySubmission({
      conversation: conversation(),
      text: "见图",
      draftRevision: 1,
      textRevision: 1,
      draftAttachmentIds: ["draft-1"],
      media,
      maxSequence: 0,
      incomingSequence: 0,
      selectionRevision: 0,
      clientRequestId: "request-2",
      now: NOW,
      next: true,
    });
    expect(message.body).toEqual({
      type: "reply",
      text: "见图",
      attachments: media,
    });
    expect(submission.next).toBe(true);
    expect(submission.draftAttachmentIds).toEqual(["draft-1"]);
  });
});

describe("Reply policy", () => {
  const attachable: Conversation = {
    ...firstConversation,
    capability: {
      state: "allowed",
      kinds: ["text", "image"],
      attachments: { maxBytes: 10_000, maxCount: 3, mimeTypes: ["image/*"] },
    },
  };

  it("allows text alone and empty drafts fall back to the text question", () => {
    expect(
      replyRestriction(
        firstConversation,
        "connected",
        { text: "你好", files: [] },
        NOW,
      ),
    ).toBeNull();
    expect(
      replyRestriction(
        firstConversation,
        "connected",
        { text: "  ", files: [] },
        NOW,
      ),
    ).toBeNull();
  });

  it("blocks the whole reply when the connection or conversation is gone", () => {
    expect(
      replyRestriction(
        firstConversation,
        "connecting",
        { text: "你好", files: [] },
        NOW,
      ),
    ).not.toBeNull();
    expect(
      replyRestriction(
        undefined,
        "connected",
        { text: "你好", files: [] },
        NOW,
      ),
    ).not.toBeNull();
  });

  it("derives kinds from content so attachments gate on capability", () => {
    const image = { name: "a.png", size: 100, mimeType: "image/png" };
    // text-only capability rejects the image even though text is fine.
    expect(
      replyRestriction(
        firstConversation,
        "connected",
        { text: "", files: [image] },
        NOW,
      ),
    ).not.toBeNull();
    expect(
      replyRestriction(
        attachable,
        "connected",
        { text: "", files: [image] },
        NOW,
      ),
    ).toBeNull();
  });

  it("enforces attachment limits with a single clock value", () => {
    const big = { name: "a.png", size: 99_999, mimeType: "image/png" };
    expect(
      replyRestriction(
        attachable,
        "connected",
        { text: "", files: [big] },
        NOW,
      ),
    ).toMatch(/大小/);
    const many = [0, 1, 2, 3].map((index) => ({
      name: `${index}.png`,
      size: 100,
      mimeType: "image/png",
    }));
    expect(
      replyRestriction(attachable, "connected", { text: "", files: many }, NOW),
    ).toMatch(/最多添加/);
  });

  it("respects an expired reply window for the composed decision", () => {
    const expired: Conversation = {
      ...attachable,
      capability: {
        ...attachable.capability,
        expiresAt: "2026-09-16T00:00:00Z",
      },
    };
    expect(
      replyRestriction(
        expired,
        "connected",
        {
          text: "",
          files: [{ name: "a.png", size: 100, mimeType: "image/png" }],
        },
        NOW,
      ),
    ).toMatch(/窗口/);
  });
});
