import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpInboxApi } from "./http-inbox-api";
import {
  CONTEXT,
  EXPECTED_ITEM,
  EXPECTED_OUTGOING,
  envelope,
  messageData,
  ORIGIN,
  SERVER_ITEM,
  SERVER_OUTGOING,
  seed,
  signal,
} from "./http-inbox-test-support";
import type { SendTarget } from "./types";

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

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

  it("rejects delivery states outside the contract three-state vocabulary", async () => {
    seed("stored-token");
    // 契约三态之外的取值不得被判为成功或静默通过：按无效响应拒绝
    for (const state of ["accepted", "delivered", "read", "unconfirmed"]) {
      const api = createHttpInboxApi({
        origin: ORIGIN,
        fetcher: async () =>
          envelope({ ...SERVER_OUTGOING, delivery: { state } }),
      });
      await expect(
        api.send({
          context: CONTEXT,
          signal: signal(),
          clientRequestId: "client-1",
          target: SEND_TARGET,
          text: "好的，已登记",
          attachments: [],
        }),
      ).rejects.toMatchObject({ kind: "invalid-response" });
    }

    // 历史页同一边界：受理记录里出现契约外取值同样拒绝
    const history = createHttpInboxApi({
      origin: ORIGIN,
      fetcher: async () =>
        envelope(
          messageData(
            [{ ...SERVER_OUTGOING, delivery: { state: "read" } }],
            null,
          ),
        ),
    });
    await expect(
      history.listMessages({
        context: CONTEXT,
        signal: signal(),
        conversationId: "41",
      }),
    ).rejects.toMatchObject({ kind: "invalid-response" });

    // 受理中的 sending 是契约取值，如实读回
    const api = createHttpInboxApi({
      origin: ORIGIN,
      fetcher: async () =>
        envelope({ ...SERVER_OUTGOING, delivery: { state: "sending" } }),
    });
    const message = await api.send({
      context: CONTEXT,
      signal: signal(),
      clientRequestId: "client-1",
      target: SEND_TARGET,
      text: "好的，已登记",
      attachments: [],
    });
    expect(message.delivery).toEqual({ state: "sending" });
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

  it("ends a reception with the PUT status contract and reads the saved conversation back", async () => {
    seed("stored-token");
    const fetcher = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(String(url)).toBe(`${ORIGIN}/api/desk/visitors/41/status`);
        expect(init?.method).toBe("PUT");
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer stored-token",
        );
        expect(JSON.parse(String(init?.body))).toEqual({ status: "closed" });
        return envelope({
          ...SERVER_ITEM,
          status: "closed",
          waitingSince: undefined,
          version: 4,
        });
      },
    );
    const api = createHttpInboxApi({ origin: ORIGIN, fetcher });

    const conversation = await api.endConversation({
      context: CONTEXT,
      signal: signal(),
      conversationId: "41",
    });

    expect(conversation).toEqual({
      ...EXPECTED_ITEM,
      status: "closed",
      waitingSince: undefined,
      version: 4,
    });
  });

  it("resumes a closed reception as needs-reply and surfaces business failures", async () => {
    seed("stored-token");
    let body: unknown;
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
        body = JSON.parse(String(init?.body));
        return envelope({ ...SERVER_ITEM, status: "needs-reply", version: 5 });
      },
    );
    const api = createHttpInboxApi({ origin: ORIGIN, fetcher });

    const conversation = await api.resumeConversation({
      context: CONTEXT,
      signal: signal(),
      conversationId: "41",
    });

    expect(body).toEqual({ status: "needs-reply" });
    expect(conversation).toMatchObject({
      id: "41",
      status: "needs-reply",
      version: 5,
    });
    expect(conversation.waitingSince).toBe("2026-10-12 10:00:00");

    // 保存被业务拒绝时按服务端真实说明反馈，不猜测成功
    const refused = createHttpInboxApi({
      origin: ORIGIN,
      fetcher: async () =>
        Response.json({ code: 10106, msg: "无访问权限", data: null }),
    });
    await expect(
      refused.endConversation({
        context: CONTEXT,
        signal: signal(),
        conversationId: "41",
      }),
    ).rejects.toMatchObject({ kind: "forbidden", code: 10106 });
  });

  it("marks reminders as locally owned so the store never reads a server unread", () => {
    expect(
      createHttpInboxApi({ origin: ORIGIN, fetcher: vi.fn() }).localUnread,
    ).toBe(true);
  });
});
