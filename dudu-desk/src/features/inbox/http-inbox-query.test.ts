import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpInboxApi } from "./http-inbox-api";
import {
  CONTEXT,
  EXPECTED_ITEM,
  envelope,
  ORIGIN,
  SERVER_ITEM,
  seed,
  signal,
} from "./http-inbox-test-support";
import type { ConversationQuery } from "./types";

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

const QUERY: ConversationQuery = {
  search: "林",
  channelId: "wechat-mp",
  status: "active",
  order: "wait",
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
    channels: [{ id: "wechat-mp", name: "微信公众号" }],
  };
}

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
          channelId: "wechat-mp",
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
    expect(page.channels).toEqual([{ id: "wechat-mp", name: "微信公众号" }]);
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
