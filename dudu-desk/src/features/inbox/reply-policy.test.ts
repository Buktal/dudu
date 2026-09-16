import { describe, expect, it } from "vitest";
import { replyRestriction } from "./reply-policy";
import { firstConversation } from "./stores/test-support";
import type { Conversation } from "./types";

const now = "2026-09-16T00:01:00Z";

const attachable: Conversation = {
  ...firstConversation,
  capability: {
    state: "allowed",
    kinds: ["text", "image"],
    attachments: { maxBytes: 10_000, maxCount: 3, mimeTypes: ["image/*"] },
  },
};

describe("reply policy", () => {
  it("allows text alone and empty drafts fall back to the text question", () => {
    expect(
      replyRestriction(
        firstConversation,
        "connected",
        { text: "你好", files: [] },
        now,
      ),
    ).toBeNull();
    expect(
      replyRestriction(
        firstConversation,
        "connected",
        { text: "  ", files: [] },
        now,
      ),
    ).toBeNull();
  });

  it("blocks the whole reply when the connection or conversation is gone", () => {
    expect(
      replyRestriction(
        firstConversation,
        "connecting",
        { text: "你好", files: [] },
        now,
      ),
    ).not.toBeNull();
    expect(
      replyRestriction(
        undefined,
        "connected",
        { text: "你好", files: [] },
        now,
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
        now,
      ),
    ).not.toBeNull();
    expect(
      replyRestriction(
        attachable,
        "connected",
        { text: "", files: [image] },
        now,
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
        now,
      ),
    ).toMatch(/大小/);
    const many = [0, 1, 2, 3].map((index) => ({
      name: `${index}.png`,
      size: 100,
      mimeType: "image/png",
    }));
    expect(
      replyRestriction(attachable, "connected", { text: "", files: many }, now),
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
        now,
      ),
    ).toMatch(/窗口/);
  });
});
