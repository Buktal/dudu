import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpInboxApi } from "./http-inbox-api";
import {
  CONTEXT,
  EXPECTED_INCOMING,
  EXPECTED_OUTGOING,
  envelope,
  messageData,
  ORIGIN,
  SERVER_INCOMING,
  SERVER_OUTGOING,
  seed,
  signal,
} from "./http-inbox-test-support";

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

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

  it("shows a channel type outside the contract as an unsupported body without guessing", async () => {
    seed("stored-token");
    const api = createHttpInboxApi({
      origin: ORIGIN,
      fetcher: async () =>
        envelope(
          messageData(
            [
              {
                ...SERVER_INCOMING,
                body: { type: "sticker", url: "https://example.com/sticker" },
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
      originalType: "sticker",
    });
  });

  it("rejects a malformed body of a known type instead of rendering a half message", async () => {
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

    await expect(
      api.listMessages({
        context: CONTEXT,
        signal: signal(),
        conversationId: "41",
      }),
    ).rejects.toMatchObject({ kind: "invalid-response" });
  });
});
