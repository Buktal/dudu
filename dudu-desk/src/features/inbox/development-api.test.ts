import { describe, expect, it } from "vitest";
import { createDevelopmentInboxApi } from "./development-api";
import type {
  Conversation,
  ConversationQuery,
  InboxEvent,
  RequestOptions,
  SendTarget,
} from "./types";

const options = (): RequestOptions => ({
  context: {
    agentId: "development-agent",
    workspaceId: "development-workspace",
  },
  signal: new AbortController().signal,
});
const query: ConversationQuery = {
  search: "",
  channelId: "all",
  status: "all",
  starred: false,
};
const targetFor = (conversation: Conversation): SendTarget => ({
  conversationId: conversation.id,
  visitorId: conversation.identity.id,
  channelId: conversation.identity.channelId,
  accountId: conversation.identity.accountId,
  externalUserId: conversation.identity.externalUserId,
});

describe("development InboxApi", () => {
  it("keeps same-name visitors separate and reads every conversation page", async () => {
    const { api } = createDevelopmentInboxApi();
    const first = await api.listConversations({ ...options(), query });
    expect(first.items[0].identity.name).toBe("林小满");
    expect(first.items[1].identity.name).toBe("林小满");
    expect(first.items[0].identity.accountId).not.toBe(
      first.items[1].identity.accountId,
    );
    expect(first.nextCursor).not.toBeNull();
    const next = await api.listConversations({
      ...options(),
      query,
      cursor: first.nextCursor ?? undefined,
    });
    const ids = [...first.items, ...next.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("reads history from newest page to older page without crossing the conversation", async () => {
    const { api } = createDevelopmentInboxApi();
    const conversationId = "dev-conversation-01";
    const latest = await api.listMessages({ ...options(), conversationId });
    expect(latest.items).toHaveLength(20);
    expect(latest.nextCursor).not.toBeNull();
    const older = await api.listMessages({
      ...options(),
      conversationId,
      cursor: latest.nextCursor ?? undefined,
    });
    expect(older.items[0].sequence).toBe(1);
    expect(older.items[older.items.length - 1]?.sequence).toBeLessThan(
      latest.items[0].sequence,
    );
    expect(
      older.items.every((message) => message.conversationId === conversationId),
    ).toBe(true);
  });

  it("filters by source without merging two same-name visitors from different accounts", async () => {
    const { api } = createDevelopmentInboxApi();
    const result = await api.listConversations({
      ...options(),
      query: { ...query, search: "林小满", channelId: "wechat-kf" },
    });
    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.identity.accountId)).toEqual([
      "wechat-main",
      "wechat-outlet",
    ]);
  });

  it("distinguishes unavailable profile fields from an editable empty note", async () => {
    const { api } = createDevelopmentInboxApi();
    const profile = await api.readProfile({
      ...options(),
      conversationId: "dev-conversation-02",
    });
    expect(
      profile.fields.find((field) => field.label === "手机号")?.value.state,
    ).toBe("not-provided");
    expect(
      profile.fields.find((field) => field.label === "邮箱")?.value.state,
    ).toBe("empty");
    expect(profile.note).toBe("");
  });

  it("rejects a cancelled read instead of returning another screen's stale result", async () => {
    const { api } = createDevelopmentInboxApi();
    const controller = new AbortController();
    const result = api.listMessages({
      ...options(),
      signal: controller.signal,
      conversationId: "dev-conversation-01",
    });
    controller.abort();
    await expect(result).rejects.toMatchObject({ kind: "aborted" });
  });

  it("persists profile edits in one work context and rejects a stale version", async () => {
    const { api } = createDevelopmentInboxApi();
    const input = { ...options(), conversationId: "dev-conversation-02" };
    const saved = await api.saveProfile({
      ...input,
      version: 1,
      tags: ["需回访"],
      note: "下午联系",
    });
    expect(saved).toMatchObject({
      version: 2,
      tags: ["需回访"],
      note: "下午联系",
    });
    const reopened = await api.readProfile(input);
    expect(reopened.note).toBe("下午联系");
    await expect(
      api.saveProfile({ ...input, version: 1, tags: [], note: "旧版本" }),
    ).rejects.toMatchObject({ kind: "business" });
    const otherAgent = await api.readProfile({
      ...input,
      context: { ...input.context, agentId: "other-agent" },
    });
    expect(otherAgent.note).toBe("");
  });

  it("accepts a reply without claiming delivery and keeps a retry idempotent", async () => {
    const { api } = createDevelopmentInboxApi();
    const context = options();
    const { items } = await api.listConversations({ ...context, query });
    const input = {
      ...context,
      target: targetFor(items[0]),
      clientRequestId: "reply-1",
      text: "正在为你查询库存。",
      attachments: [],
    };
    const accepted = await api.send(input);
    expect(accepted).toMatchObject({
      direction: "outgoing",
      delivery: { state: "accepted" },
      body: { type: "text", text: "正在为你查询库存。" },
    });
    const retry = await api.send({
      ...input,
      target: {
        accountId: input.target.accountId,
        channelId: input.target.channelId,
        conversationId: input.target.conversationId,
        externalUserId: input.target.externalUserId,
        visitorId: input.target.visitorId,
      },
    });
    expect(retry.id).toBe(accepted.id);
    const history = await api.listMessages({
      ...context,
      conversationId: items[0].id,
    });
    expect(
      history.items.filter((message) => message.clientRequestId === "reply-1"),
    ).toHaveLength(1);
  });

  it("refuses a mismatched source identity or a closed channel reply window", async () => {
    const { api } = createDevelopmentInboxApi();
    const context = options();
    const { items } = await api.listConversations({ ...context, query });
    const input = {
      ...context,
      clientRequestId: "invalid-target",
      text: "不应发出",
      attachments: [],
    };
    await expect(
      api.send({
        ...input,
        target: {
          ...targetFor(items[0]),
          accountId: items[1].identity.accountId,
        },
      }),
    ).rejects.toMatchObject({ kind: "business" });
    const restricted = items.find(
      (item) => item.capability.state === "restricted",
    );
    expect(restricted).toBeDefined();
    if (!restricted) throw new Error("Missing restricted fixture");
    await expect(
      api.send({ ...input, target: targetFor(restricted) }),
    ).rejects.toMatchObject({ kind: "business" });
    expect(
      await api.getCapability({ ...context, conversationId: restricted.id }),
    ).toMatchObject({ state: "restricted" });
  });

  it("updates unread, star and closed state independently", async () => {
    const { api } = createDevelopmentInboxApi();
    const input = { ...options(), conversationId: "dev-conversation-01" };
    const read = await api.markRead({ ...input, throughSequence: 39 });
    expect(read).toMatchObject({ unread: 0, status: "needs-reply" });
    await api.setStarred({ ...input, starred: false });
    const starred = await api.listConversations({
      ...input,
      query: { ...query, starred: true },
    });
    expect(starred.items.some((item) => item.id === input.conversationId)).toBe(
      false,
    );
    expect(await api.endConversation(input)).toMatchObject({
      status: "closed",
      capability: { state: "restricted" },
    });
  });

  it("emits explicit incoming messages and receipts, and unsubscribes cleanly", async () => {
    const { api, controls } = createDevelopmentInboxApi();
    const input = options();
    const events: InboxEvent[] = [];
    const unsubscribe = api.subscribe({
      ...input,
      onEvent: (event) => events.push(event),
      onConnection: () => {},
    });
    const { items } = await api.listConversations({ ...input, query });
    const sent = await api.send({
      ...input,
      target: targetFor(items[0]),
      clientRequestId: "event-reply",
      text: "马上为你处理",
      attachments: [],
    });
    expect(events.some((event) => event.type === "receipt")).toBe(false);
    controls.receipt(input.context, {
      conversationId: items[0].id,
      messageId: sent.id,
      state: "delivered",
    });
    expect(events.find((event) => event.type === "receipt")).toMatchObject({
      delivery: { state: "delivered" },
    });
    controls.receive(input.context, items[1].id, "还有一个问题");
    expect(
      events.some(
        (event) =>
          event.type === "message" &&
          event.message.conversationId === items[1].id,
      ),
    ).toBe(true);
    unsubscribe();
    const count = events.length;
    controls.receive(input.context, items[1].id, "退订后的来信");
    expect(events).toHaveLength(count);
  });

  it("leaves an uncertain send reconcilable and a refusal safely retryable", async () => {
    const input = options();
    const { api } = createDevelopmentInboxApi({ scenario: "send-unconfirmed" });
    const { items } = await api.listConversations({ ...input, query });
    const submission = {
      ...input,
      target: targetFor(items[0]),
      clientRequestId: "uncertain-send",
      text: "请查收",
      attachments: [],
    };
    await expect(api.send(submission)).rejects.toMatchObject({
      kind: "network",
    });
    const recovered = await api.send(submission);
    expect(recovered.delivery?.state).toBe("accepted");
    const history = await api.listMessages({
      ...input,
      conversationId: items[0].id,
    });
    expect(
      history.items.filter(
        (message) => message.clientRequestId === submission.clientRequestId,
      ),
    ).toHaveLength(1);
    const rejected = createDevelopmentInboxApi({
      scenario: "send-rejected",
    }).api;
    await expect(rejected.send(submission)).rejects.toMatchObject({
      kind: "business",
    });
    expect((await rejected.send(submission)).delivery?.state).toBe("accepted");
  });

  it("prepares an attachment for its original target and includes its metadata in the reply", async () => {
    const { api } = createDevelopmentInboxApi();
    const input = options();
    const { items } = await api.listConversations({ ...input, query });
    const target = targetFor(items[0]);
    const media = await api.prepareAttachment({
      ...input,
      target,
      file: new File(["订单资料"], "订单资料.txt", { type: "text/plain" }),
    });
    expect(media).toMatchObject({
      kind: "file",
      name: "订单资料.txt",
      mimeType: "text/plain",
    });
    expect(media.url).toMatch(/^data:text\/plain;base64,/);
    const sent = await api.send({
      ...input,
      target,
      clientRequestId: "attachment-send",
      text: "请查收附件",
      attachments: [media],
    });
    expect(sent.body).toMatchObject({
      type: "reply",
      attachments: [{ id: media.id, name: "订单资料.txt" }],
    });
    await expect(
      api.send({
        ...input,
        target: targetFor(items[1]),
        clientRequestId: "wrong-attachment-target",
        text: "",
        attachments: [media],
      }),
    ).rejects.toMatchObject({ kind: "business" });
  });

  it("cancels a held send without mutating history and releases the adapter session", async () => {
    const { api, controls, dispose } = createDevelopmentInboxApi();
    const input = options();
    const { items } = await api.listConversations({ ...input, query });
    const controller = new AbortController();
    const release = controls.holdNext(input.context, "send");
    const result = api.send({
      ...input,
      signal: controller.signal,
      target: targetFor(items[0]),
      clientRequestId: "cancelled-send",
      text: "不应发出",
      attachments: [],
    });
    await Promise.resolve();
    controller.abort();
    await expect(result).rejects.toMatchObject({ kind: "aborted" });
    release();
    const history = await api.listMessages({
      ...input,
      conversationId: items[0].id,
    });
    expect(
      history.items.some(
        (message) => message.clientRequestId === "cancelled-send",
      ),
    ).toBe(false);
    dispose();
    await expect(
      api.listConversations({ ...input, query }),
    ).rejects.toMatchObject({ kind: "aborted" });
  });

  it("replays disconnected events from the subscriber checkpoint without leaking another agent's events", () => {
    const { api, controls } = createDevelopmentInboxApi();
    const input = options();
    const events: InboxEvent[] = [];
    const off = api.subscribe({
      ...input,
      onEvent: (event) => events.push(event),
      onConnection: () => {},
    });
    controls.receive(input.context, "dev-conversation-01", "已收到的来信");
    const checkpoint = events[events.length - 1].cursor;
    const before = events.length;
    controls.connection(input.context, "disconnected");
    controls.receive(input.context, "dev-conversation-01", "断线时的来信");
    controls.receive(
      { ...input.context, agentId: "other-agent" },
      "dev-conversation-01",
      "另一位坐席的来信",
    );
    expect(events).toHaveLength(before);
    controls.connection(input.context, "connected");
    expect(events).toHaveLength(before + 2);
    off();
    const recovered: InboxEvent[] = [];
    api.subscribe({
      ...input,
      cursor: checkpoint,
      onEvent: (event) => recovered.push(event),
      onConnection: () => {},
    });
    expect(recovered).toHaveLength(2);
    expect(recovered[0]).toMatchObject({
      type: "message",
      message: { body: { text: "断线时的来信" } },
    });
  });

  it("uses explicit development scenarios for read failure, auth expiry and an empty queue", async () => {
    const input = options();
    const failed = createDevelopmentInboxApi({ scenario: "read-error" }).api;
    await expect(
      failed.listMessages({ ...input, conversationId: "dev-conversation-01" }),
    ).rejects.toMatchObject({ kind: "network" });
    expect(
      (
        await failed.listMessages({
          ...input,
          conversationId: "dev-conversation-01",
        })
      ).items.length,
    ).toBeGreaterThan(0);
    const expired = createDevelopmentInboxApi({ scenario: "auth-expired" }).api;
    await expect(
      expired.listConversations({ ...input, query }),
    ).rejects.toMatchObject({ kind: "authentication" });
    const empty = createDevelopmentInboxApi({ scenario: "empty" }).api;
    expect(await empty.listConversations({ ...input, query })).toMatchObject({
      items: [],
      total: 0,
      nextCursor: null,
    });
  });
});
