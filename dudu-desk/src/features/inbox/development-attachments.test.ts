import { describe, expect, it } from "vitest";
import { createDevelopmentInboxApi } from "./development-api";
import type { ReplyCapability, RequestOptions, SendTarget } from "./types";

async function setup() {
  const driver = createDevelopmentInboxApi();
  const options: RequestOptions = {
    context: { workspaceId: "workspace", agentId: "agent" },
    signal: new AbortController().signal,
  };
  const { items } = await driver.api.listConversations({
    ...options,
    query: { search: "", channelId: "all", status: "all", starred: false },
  });
  const conversation = items[0];
  const target: SendTarget = {
    conversationId: conversation.id,
    visitorId: conversation.identity.id,
    externalUserId: conversation.identity.externalUserId,
    channelId: conversation.identity.channelId,
    accountId: conversation.identity.accountId,
  };
  return { ...driver, options, conversation, target };
}

describe("development attachment contract", () => {
  it("does not prepare files until the channel supplies attachment constraints", async () => {
    const { api, controls, options, target } = await setup();
    controls.capability(options.context, target.conversationId, {
      state: "allowed",
      kinds: ["text", "file"],
    });
    await expect(
      api.prepareAttachment({
        ...options,
        target,
        file: new File(["资料"], "资料.txt", { type: "text/plain" }),
      }),
    ).rejects.toMatchObject({ kind: "business" });
  });

  it.each([
    { reason: "unavailable constraints", attachments: undefined },
    {
      reason: "a reduced size limit",
      attachments: { maxBytes: 1, maxCount: 4, mimeTypes: ["text/plain"] },
    },
    {
      reason: "a restricted file format",
      attachments: { maxBytes: 1024, maxCount: 4, mimeTypes: ["image/png"] },
    },
  ])(
    "rechecks $reason before sending prepared media",
    async ({ attachments }) => {
      const { api, controls, options, target, conversation } = await setup();
      const media = await api.prepareAttachment({
        ...options,
        target,
        file: new File(["订单资料"], "订单资料.txt", { type: "text/plain" }),
      });
      const capability: ReplyCapability = {
        ...conversation.capability,
        attachments,
      };
      controls.capability(options.context, target.conversationId, capability);
      await expect(
        api.send({
          ...options,
          target,
          clientRequestId: "constraints-changed",
          text: "请查收",
          attachments: [media],
        }),
      ).rejects.toMatchObject({ kind: "business" });
      const history = await api.listMessages({
        ...options,
        conversationId: target.conversationId,
      });
      expect(
        history.items.some(
          (message) => message.clientRequestId === "constraints-changed",
        ),
      ).toBe(false);
    },
  );
});
