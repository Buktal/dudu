import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DESK_SESSION_KEY } from "@/lib/desk-session";
import { createHttpInboxApi } from "./http-inbox-api";
import type {
  Conversation,
  ConversationQuery,
  InboxMessage,
  SendTarget,
} from "./types";

const ORIGIN = "https://desk.example.test";
const CONTEXT = { agentId: "agent-a", workspaceId: "workspace-a" };
const QUERY: ConversationQuery = {
  search: "林",
  channelId: "wechat",
  status: "active",
  order: "wait",
};

function signal() {
  return new AbortController().signal;
}

function seed(token: string, origin = ORIGIN) {
  sessionStorage.setItem(DESK_SESSION_KEY, JSON.stringify({ origin, token }));
}

function envelope(data: unknown) {
  return Response.json({ code: 0, msg: "操作成功", data });
}

// 独立于实现写出的服务端条目与期望会话
const SERVER_ITEM = {
  id: "41",
  identity: {
    id: "41",
    externalUserId: "external-a",
    name: "林小满",
    channelId: "wechat",
    channelName: "微信",
    accountId: "51",
    accountName: "公众号",
  },
  status: "needs-reply",
  preview: "最后一条摘要",
  updatedAt: "2026-10-12 10:30:15",
  waitingSince: "2026-10-12 10:00:00",
  messageCount: 7,
  version: 3,
  capability: {
    state: "restricted",
    kinds: [],
    reason: "渠道发送能力尚未接入",
  },
};

const EXPECTED_ITEM: Conversation = {
  id: "41",
  identity: {
    id: "41",
    externalUserId: "external-a",
    name: "林小满",
    avatarUrl: undefined,
    channelId: "wechat",
    channelName: "微信",
    accountId: "51",
    accountName: "公众号",
  },
  status: "needs-reply",
  unread: 0,
  preview: "最后一条摘要",
  updatedAt: "2026-10-12 10:30:15",
  waitingSince: "2026-10-12 10:00:00",
  messageCount: 7,
  version: 3,
  capability: {
    state: "restricted",
    kinds: [],
    reason: "渠道发送能力尚未接入",
    nextStep: undefined,
  },
};

function pageData(input: {
  items?: unknown[];
  total?: number;
  page?: number;
  pageSize?: number;
}) {
  return {
    items: input.items ?? [SERVER_ITEM],
    total: input.total ?? 1,
    page: input.page ?? 1,
    pageSize: input.pageSize ?? 30,
    counts: { active: 4, needsReply: 3, waiting: 1, closed: 2 },
    channels: [{ id: "wechat", name: "微信" }],
  };
}

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("http inbox adapter", () => {
  it("loads the authorized summary page with the stored token and the query contract", async () => {
    seed("stored-token");
    const fetcher = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(String(url)).toBe(`${ORIGIN}/api/desk/visitors/query`);
        expect(init?.method).toBe("POST");
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer stored-token",
        );
        expect(JSON.parse(String(init?.body))).toEqual({
          search: "林",
          channelId: "wechat",
          status: "active",
          order: "wait",
          page: 1,
          pageSize: 30,
        });
        return envelope(pageData({ total: 35, pageSize: 30 }));
      },
    );
    const api = createHttpInboxApi({ origin: ORIGIN, fetcher });

    const page = await api.listConversations({
      context: CONTEXT,
      signal: signal(),
      query: QUERY,
    });

    expect(page.items).toEqual([EXPECTED_ITEM]);
    expect(page.nextCursor).toBe("2");
    expect(page.total).toBe(35);
    expect(page.counts).toEqual({
      active: 4,
      needsReply: 3,
      waiting: 1,
      closed: 2,
    });
    expect(page.channels).toEqual([{ id: "wechat", name: "微信" }]);
  });

  it("omits identity fields the channel never provided", async () => {
    seed("stored-token");
    const api = createHttpInboxApi({
      origin: ORIGIN,
      fetcher: async () =>
        envelope(
          pageData({
            items: [
              {
                ...SERVER_ITEM,
                identity: {
                  ...SERVER_ITEM.identity,
                  name: undefined,
                  avatarUrl: undefined,
                },
              },
            ],
          }),
        ),
    });

    const page = await api.listConversations({
      context: CONTEXT,
      signal: signal(),
      query: QUERY,
    });

    expect(page.items[0].identity.name).toBeUndefined();
    expect(page.items[0].identity.avatarUrl).toBeUndefined();
    expect(page.items[0].identity.externalUserId).toBe("external-a");
  });

  it("continues from the page-number cursor and returns no cursor on the last page", async () => {
    seed("stored-token");
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({ page: 2 });
        return envelope(pageData({ total: 31, page: 2, pageSize: 30 }));
      },
    );
    const api = createHttpInboxApi({ origin: ORIGIN, fetcher });

    const page = await api.listConversations({
      context: CONTEXT,
      signal: signal(),
      query: QUERY,
      cursor: "2",
    });

    expect(page.nextCursor).toBeNull();
    expect(page.items).toHaveLength(1);
  });

  it("returns an empty page without a cursor when the filter matches nothing", async () => {
    seed("stored-token");
    const api = createHttpInboxApi({
      origin: ORIGIN,
      fetcher: async () => envelope(pageData({ items: [], total: 0 })),
    });

    const page = await api.listConversations({
      context: CONTEXT,
      signal: signal(),
      query: QUERY,
    });

    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it("reads the token per request so a fresh login is picked up", async () => {
    const calls: (string | null)[] = [];
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        calls.push(new Headers(init?.headers).get("Authorization"));
        return envelope(pageData({}));
      },
    );
    const api = createHttpInboxApi({ origin: ORIGIN, fetcher });

    await api.listConversations({
      context: CONTEXT,
      signal: signal(),
      query: QUERY,
    });
    seed("issued-later");
    await api.listConversations({
      context: CONTEXT,
      signal: signal(),
      query: QUERY,
    });

    expect(calls).toEqual([null, "Bearer issued-later"]);
  });

  it("surfaces server authentication and no-access failures apart", async () => {
    seed("stale-token");
    const expired = createHttpInboxApi({
      origin: ORIGIN,
      fetcher: async () =>
        Response.json({ code: 10101, msg: "请先登录", data: null }),
    });
    await expect(
      expired.listConversations({
        context: CONTEXT,
        signal: signal(),
        query: QUERY,
      }),
    ).rejects.toMatchObject({ kind: "authentication", code: 10101 });

    const forbidden = createHttpInboxApi({
      origin: ORIGIN,
      fetcher: async () =>
        Response.json({ code: 10106, msg: "无访问权限", data: null }),
    });
    await expect(
      forbidden.listConversations({
        context: CONTEXT,
        signal: signal(),
        query: QUERY,
      }),
    ).rejects.toMatchObject({ kind: "forbidden", code: 10106 });
  });

  it("rejects a malformed summary page instead of guessing a conversation", async () => {
    seed("stored-token");
    const api = createHttpInboxApi({
      origin: ORIGIN,
      fetcher: async () =>
        envelope(pageData({ items: [{ ...SERVER_ITEM, version: "3" }] })),
    });

    await expect(
      api.listConversations({
        context: CONTEXT,
        signal: signal(),
        query: QUERY,
      }),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("keeps capabilities the server does not provide unavailable", async () => {
    const api = createHttpInboxApi({ origin: ORIGIN, fetcher: vi.fn() });
    const input = { context: CONTEXT, signal: signal(), conversationId: "41" };

    for (const call of [
      () => api.readProfile(input),
      // 服务端没有已读接口：待处理提醒只在本地运行态维护，不调用它
      () => api.markRead({ ...input, throughSequence: 1 }),
      () => api.endConversation(input),
      () => api.resumeConversation(input),
    ]) {
      await expect(call()).rejects.toMatchObject({
        kind: "unavailable",
        message: "接待服务尚未连接，当前操作暂不可用",
      });
    }

    let connection = "connecting";
    const unsubscribe = api.subscribe({
      context: CONTEXT,
      signal: signal(),
      onEvent: () => {},
      onConnection: (state) => {
        connection = state;
      },
    });
    expect(connection).toBe("unavailable");
    expect(unsubscribe()).toBeUndefined();
  });
});

// 独立于实现写出的服务端消息与期望消息
const SERVER_INCOMING = {
  id: "9001",
  conversationId: "41",
  direction: "incoming",
  body: { type: "text", text: "还想问问保修" },
  createdAt: "2026-10-12 09:36:00",
  sequence: 36,
  version: 1,
};

const SERVER_OUTGOING = {
  id: "9002",
  conversationId: "41",
  clientRequestId: "client-1",
  direction: "outgoing",
  body: { type: "text", text: "好的，已登记" },
  createdAt: "2026-10-12 09:40:00",
  sequence: 37,
  version: 2,
  senderUserId: "9",
  senderName: "林舟",
  delivery: { state: "sent" },
};

const EXPECTED_INCOMING: InboxMessage = {
  id: "9001",
  conversationId: "41",
  direction: "incoming",
  body: { type: "text", text: "还想问问保修" },
  createdAt: "2026-10-12 09:36:00",
  sequence: 36,
  version: 1,
};

const EXPECTED_OUTGOING: InboxMessage = {
  id: "9002",
  conversationId: "41",
  clientRequestId: "client-1",
  direction: "outgoing",
  body: { type: "text", text: "好的，已登记" },
  createdAt: "2026-10-12 09:40:00",
  sequence: 37,
  version: 2,
  senderUserId: "9",
  senderName: "林舟",
  delivery: { state: "sent" },
};

function messageData(items: unknown[], nextCursor: string | null) {
  return { items, nextCursor };
}

describe("http inbox history adapter", () => {
  it("reads the bounded recent page with the contract defaults", async () => {
    seed("stored-token");
    const fetcher = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(String(url)).toBe(
          `${ORIGIN}/api/desk/visitors/41/messages?limit=30`,
        );
        expect(init?.method ?? "GET").toBe("GET");
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer stored-token",
        );
        return envelope(messageData([SERVER_INCOMING, SERVER_OUTGOING], "36"));
      },
    );
    const api = createHttpInboxApi({ origin: ORIGIN, fetcher });

    const page = await api.listMessages({
      context: CONTEXT,
      signal: signal(),
      conversationId: "41",
    });

    expect(page.items).toEqual([EXPECTED_INCOMING, EXPECTED_OUTGOING]);
    expect(page.nextCursor).toBe("36");
  });

  it("continues from the earlier cursor and returns no cursor on the oldest page", async () => {
    seed("stored-token");
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe(
        `${ORIGIN}/api/desk/visitors/41/messages?beforeSequence=36&limit=30`,
      );
      return envelope(messageData([SERVER_INCOMING], null));
    });
    const api = createHttpInboxApi({ origin: ORIGIN, fetcher });

    const page = await api.listMessages({
      context: CONTEXT,
      signal: signal(),
      conversationId: "41",
      cursor: "36",
    });

    expect(page.items).toEqual([EXPECTED_INCOMING]);
    expect(page.nextCursor).toBeNull();
  });

  it("returns an empty page for a conversation without messages", async () => {
    seed("stored-token");
    const api = createHttpInboxApi({
      origin: ORIGIN,
      fetcher: async () => envelope(messageData([], null)),
    });

    const page = await api.listMessages({
      context: CONTEXT,
      signal: signal(),
      conversationId: "77",
    });

    expect(page.items).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it("rejects cursors and pages it cannot trust instead of guessing", async () => {
    seed("stored-token");
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes("beforeSequence=36"))
        return envelope(
          messageData([{ ...SERVER_INCOMING, sequence: "36" }], null),
        );
      return envelope(
        messageData([{ ...SERVER_INCOMING, body: { type: "text" } }], null),
      );
    });
    const api = createHttpInboxApi({ origin: ORIGIN, fetcher });

    await expect(
      api.listMessages({
        context: CONTEXT,
        signal: signal(),
        conversationId: "41",
        cursor: "not-a-sequence",
      }),
    ).rejects.toMatchObject({ kind: "invalid-response" });
    expect(fetcher).not.toHaveBeenCalled();

    await expect(
      api.listMessages({
        context: CONTEXT,
        signal: signal(),
        conversationId: "41",
        cursor: "36",
      }),
    ).rejects.toMatchObject({ kind: "invalid-response" });

    // 文本消息缺少正文：契约被破坏，按无效响应处理，不渲染空气泡
    await expect(
      api.listMessages({
        context: CONTEXT,
        signal: signal(),
        conversationId: "41",
      }),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });

  it("shows content outside the text contract as an unsupported body without guessing", async () => {
    seed("stored-token");
    const api = createHttpInboxApi({
      origin: ORIGIN,
      fetcher: async () =>
        envelope(
          messageData(
            [
              {
                ...SERVER_INCOMING,
                body: { type: "image", media: { id: "m1" } },
              },
            ],
            null,
          ),
        ),
    });

    const page = await api.listMessages({
      context: CONTEXT,
      signal: signal(),
      conversationId: "41",
    });

    expect(page.items[0].body).toEqual({
      type: "unknown",
      originalType: "image",
    });
  });
});

// 独立于实现写出的发送目标与失败响应（渠道原始说明来自公众号错误响应）
const SEND_TARGET: SendTarget = {
  conversationId: "41",
  visitorId: "41",
  channelId: "wechat",
  accountId: "51",
  externalUserId: "external-a",
};
const CHANNEL_FAILURE =
  "微信客服消息发送失败：40001 invalid credential, access_token is invalid or not latest";

describe("http inbox reply adapter", () => {
  it("posts the text reply with the stored token and reads the persisted message back", async () => {
    seed("stored-token");
    const fetcher = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(String(url)).toBe(`${ORIGIN}/api/desk/visitors/41/messages`);
        expect(init?.method).toBe("POST");
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer stored-token",
        );
        expect(JSON.parse(String(init?.body))).toEqual({
          clientRequestId: "client-1",
          text: "好的，已登记",
        });
        return envelope(SERVER_OUTGOING);
      },
    );
    const api = createHttpInboxApi({ origin: ORIGIN, fetcher });

    const message = await api.send({
      context: CONTEXT,
      signal: signal(),
      clientRequestId: "client-1",
      target: SEND_TARGET,
      text: "好的，已登记",
      attachments: [],
    });

    expect(message).toEqual(EXPECTED_OUTGOING);
  });

  it("returns a channel failure as the persisted reply instead of an invalid response", async () => {
    seed("stored-token");
    const api = createHttpInboxApi({
      origin: ORIGIN,
      fetcher: async () =>
        envelope({
          ...SERVER_OUTGOING,
          delivery: { state: "failed", reason: CHANNEL_FAILURE },
        }),
    });

    const message = await api.send({
      context: CONTEXT,
      signal: signal(),
      clientRequestId: "client-1",
      target: SEND_TARGET,
      text: "好的，已登记",
      attachments: [],
    });

    expect(message.id).toBe("9002");
    expect(message.delivery).toEqual({
      state: "failed",
      reason: CHANNEL_FAILURE,
    });
  });

  it("refuses to send attachments in the text-only integration", async () => {
    seed("stored-token");
    const fetcher = vi.fn();
    const api = createHttpInboxApi({ origin: ORIGIN, fetcher });

    await expect(
      api.send({
        context: CONTEXT,
        signal: signal(),
        clientRequestId: "client-1",
        target: SEND_TARGET,
        text: "带附件的回复",
        attachments: [
          {
            id: "m1",
            kind: "image",
            name: "图片.png",
            mimeType: "image/png",
            size: 12,
          },
        ],
      }),
    ).rejects.toMatchObject({ kind: "unavailable" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reads the reply capability of the visitor", async () => {
    seed("stored-token");
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe(`${ORIGIN}/api/desk/visitors/41/capability`);
      return envelope({ state: "allowed", kinds: ["text"] });
    });
    const api = createHttpInboxApi({ origin: ORIGIN, fetcher });

    const capability = await api.getCapability({
      context: CONTEXT,
      signal: signal(),
      conversationId: "41",
    });

    expect(capability).toEqual({
      state: "allowed",
      kinds: ["text"],
      reason: undefined,
      nextStep: undefined,
    });
  });

  it("marks reminders as locally owned so the store never reads a server unread", () => {
    expect(
      createHttpInboxApi({ origin: ORIGIN, fetcher: vi.fn() }).localUnread,
    ).toBe(true);
  });
});
