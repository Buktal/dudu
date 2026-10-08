import { describe, expect, it } from "vitest";
import type { InboxEvent, ReplyCapability, RequestOptions } from "../types";
import { createDevelopmentInboxApi } from "./api";

const options = (): RequestOptions & { conversationId: string } => ({
  context: {
    agentId: "development-agent",
    workspaceId: "development-workspace",
  },
  signal: new AbortController().signal,
  conversationId: "dev-conversation-01",
});

describe("development reception API", () => {
  it("ends and resumes reception with its actual image-only capability and publishes confirmation", async () => {
    const { api, controls } = createDevelopmentInboxApi();
    const input = options();
    const capability: ReplyCapability = {
      state: "allowed",
      kinds: ["image"],
      expiresAt: "2026-10-01T00:00:00Z",
      remaining: 2,
      attachments: { maxBytes: 1024, maxCount: 1, mimeTypes: ["image/png"] },
    };
    controls.capability(input.context, input.conversationId, capability);
    const events: InboxEvent[] = [];
    api.subscribe({
      ...input,
      onEvent: (event) => events.push(event),
      onConnection: () => {},
    });
    const closed = await api.endConversation(input);
    expect(closed).toMatchObject({
      status: "closed",
      capability: { state: "restricted", kinds: [] },
    });

    const resumed = await api.resumeConversation(input);

    expect(resumed).toMatchObject({
      id: input.conversationId,
      status: "needs-reply",
      version: closed.version + 1,
    });
    expect(resumed.capability).toEqual(capability);
    expect(await api.getCapability(input)).toEqual(capability);
    expect(events[events.length - 1]).toMatchObject({
      type: "conversation",
      context: input.context,
      conversation: resumed,
    });
  });

  it.each<ReplyCapability>([
    { state: "restricted", kinds: [], reason: "渠道回复窗口已关闭" },
    { state: "unknown", kinds: [], reason: "渠道暂未返回最新权限" },
    { state: "allowed", kinds: ["file"], remaining: 1 },
  ])(
    "uses the latest $state capability received while reception was closed",
    async (capability) => {
      const { api, controls } = createDevelopmentInboxApi();
      const input = options();
      await api.endConversation(input);
      controls.capability(input.context, input.conversationId, capability);

      const resumed = await api.resumeConversation(input);

      expect(resumed.status).toBe("needs-reply");
      expect(resumed.capability).toEqual(capability);
      expect(await api.getCapability(input)).toEqual(capability);
    },
  );

  it("restores the actual channel capability when a new incoming message reopens reception", async () => {
    const { api, controls } = createDevelopmentInboxApi();
    const input = options();
    const capability = await api.getCapability(input);
    await api.endConversation(input);
    const events: InboxEvent[] = [];
    api.subscribe({
      ...input,
      onEvent: (event) => events.push(event),
      onConnection: () => {},
    });

    controls.receive(
      input.context,
      input.conversationId,
      "还有一个问题需要确认",
    );

    expect(await api.getCapability(input)).toEqual(capability);
    expect(events[events.length - 1]).toMatchObject({
      type: "conversation",
      conversation: {
        id: input.conversationId,
        status: "needs-reply",
        capability,
      },
    });
  });

  it("preserves an initially closed conversation's channel capability through another end request", async () => {
    const { api } = createDevelopmentInboxApi();
    const input = { ...options(), conversationId: "dev-conversation-34" };
    const capability = await api.getCapability(input);

    await api.endConversation(input);
    const resumed = await api.resumeConversation(input);

    expect(resumed.status).toBe("needs-reply");
    expect(resumed.capability).toEqual(capability);
  });

  it("leaves an active waiting conversation unchanged when resume is repeated", async () => {
    const { api } = createDevelopmentInboxApi();
    const input = options();
    const { items } = await api.listConversations({
      ...input,
      query: {
        search: "",
        channelId: "all",
        status: "waiting",
        starred: false,
        order: "wait",
      },
    });
    const waiting = items[0];
    expect(waiting).toBeDefined();

    const resumed = await api.resumeConversation({
      ...input,
      conversationId: waiting.id,
    });

    expect(resumed).toEqual(waiting);
  });

  it("cancels a held resume without changing the confirmed closed state or losing its capability", async () => {
    const { api, controls } = createDevelopmentInboxApi();
    const input = options();
    const capability = await api.getCapability(input);
    const closed = await api.endConversation(input);
    const controller = new AbortController();
    const release = controls.holdNext(input.context, "resumeConversation");

    const result = api.resumeConversation({
      ...input,
      signal: controller.signal,
    });
    controller.abort();
    await expect(result).rejects.toMatchObject({ kind: "aborted" });
    release();

    const { items } = await api.listConversations({
      ...input,
      query: {
        search: "",
        channelId: "all",
        status: "closed",
        starred: false,
        order: "wait",
      },
    });
    expect(items.find((item) => item.id === input.conversationId)).toEqual(
      closed,
    );
    expect((await api.resumeConversation(input)).capability).toEqual(
      capability,
    );
  });

  it.each([
    ["dev-conversation-05", "restricted"],
    ["dev-conversation-06", "unknown"],
  ] as const)(
    "preserves %s's %s permission after ending and resuming",
    async (conversationId, state) => {
      const { api } = createDevelopmentInboxApi();
      const input = { ...options(), conversationId };
      const capability = await api.getCapability(input);
      expect(capability.state).toBe(state);

      await api.endConversation(input);
      await api.endConversation(input);
      const resumed = await api.resumeConversation(input);

      expect(resumed.status).toBe("needs-reply");
      expect(resumed.capability).toEqual(capability);
    },
  );
});
