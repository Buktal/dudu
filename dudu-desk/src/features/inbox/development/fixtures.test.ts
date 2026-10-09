import { describe, expect, it } from "vitest";
import {
  defineTestConversation,
  firstConversation,
  secondConversation,
} from "../stores/test-support";
import {
  allowedCapability,
  defineConversation,
  restrictedCapability,
  unknownCapability,
} from "./fixtures";

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
  it("fills version and a text-only capability by default", () => {
    expect(defineConversation({ id: "a", identity })).toMatchObject({
      status: "needs-reply",
      unread: 0,
      version: 1,
      capability: { state: "allowed", kinds: ["text"] },
    });
  });

  it("keeps the hand-built test conversation identical through the builder", () => {
    expect(firstConversation).toMatchObject({
      id: "conversation-a",
      status: "needs-reply",
      unread: 1,
      preview: "你好，想问一下",
      version: 1,
      capability: { state: "allowed", kinds: ["text"] },
    });
  });

  it("shares litmus between the paired test cards", () => {
    expect(secondConversation).toMatchObject({
      status: firstConversation.status,
      unread: firstConversation.unread,
      preview: firstConversation.preview,
    });
    expect(
      defineTestConversation({
        id: "x",
        identity: firstConversation.identity,
      }).preview,
    ).toBe("你好，想问一下");
  });

  it("builds capability variants through one site", () => {
    expect(allowedCapability(["text"])).toEqual({
      state: "allowed",
      kinds: ["text"],
    });
    expect(restrictedCapability("r", "n")).toEqual({
      state: "restricted",
      kinds: [],
      reason: "r",
      nextStep: "n",
    });
    expect(unknownCapability("r", "n")).toEqual({
      state: "unknown",
      kinds: [],
      reason: "r",
      nextStep: "n",
    });
  });
});
