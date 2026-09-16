import { describe, expect, it } from "vitest";
import { defineConversation } from "./fixtures";
import { firstConversation } from "./stores/test-support";

const identity = {
  id: "visitor-a",
  externalUserId: "external-a",
  name: "林小满",
  channelId: "wechat-kf",
  channelName: "微信客服",
  accountId: "account-a",
  accountName: "品牌旗舰店",
};

describe("fixture builder", () => {
  it("fills version, starred and a text-only capability by default", () => {
    expect(defineConversation({ id: "a", identity })).toMatchObject({
      status: "needs-reply",
      unread: 0,
      starred: false,
      version: 1,
      capability: { state: "allowed", kinds: ["text"] },
    });
  });

  it("keeps the hand-built test conversation identical through the builder", () => {
    expect(firstConversation).toMatchObject({
      id: "conversation-a",
      status: "needs-reply",
      unread: 1,
      starred: false,
      preview: "你好，想问一下",
      version: 1,
      capability: { state: "allowed", kinds: ["text"] },
    });
  });
});
