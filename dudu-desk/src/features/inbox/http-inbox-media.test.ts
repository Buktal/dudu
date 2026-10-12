import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHttpInboxApi } from "./http-inbox-api";
import {
  CONTEXT,
  envelope,
  messageData,
  ORIGIN,
  SERVER_INCOMING,
  seed,
  signal,
} from "./http-inbox-test-support";

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

const SERVER_IMAGE_BODY = {
  type: "image",
  media: {
    kind: "image",
    id: "MEDIA_IMAGE",
    name: "云朵托特包.png",
    mimeType: "image/png",
    size: 1450,
    url: "https://mmbiz.qpic.cn/pic",
  },
};
const SERVER_AUDIO_BODY = {
  type: "audio",
  media: { kind: "audio", id: "MEDIA_VOICE" },
};
const SERVER_FILE_BODY = {
  type: "file",
  media: { kind: "file", id: "MEDIA_FILE", size: 42 },
};
const SERVER_VIDEO_BODY = {
  type: "video",
  media: { kind: "video", id: "4:0", url: "https://cdn.example.test/v.mp4" },
};
const SERVER_LINK_BODY = {
  type: "link",
  title: "活动页",
  url: "https://example.com/act",
  description: "限时活动",
};
const SERVER_LOCATION_BODY = {
  type: "location",
  label: "广州市海珠区客村",
  latitude: 23.134521,
  longitude: 113.358803,
};
const SERVER_QUOTE_BODY = {
  type: "quote",
  text: "是这一款米白色吗？",
  quotedText: "米白和雾灰两个颜色都可以先确认库存。",
  messageId: "37",
};
const SERVER_CARD_BODY = {
  type: "card",
  kind: "order",
  externalId: "ORDER-1",
  title: "订单卡片",
  url: "https://example.com/orders/1",
};
const SERVER_UNKNOWN_BODY = {
  type: "unknown",
  originalType: "sticker",
  explanation: "该渠道交互消息暂不支持完整展示",
  sourceUrl: "https://example.com/messages/sticker",
};
const SERVER_REPLY_BODY = {
  type: "reply",
  text: "包身细节已补充",
  attachments: [
    {
      kind: "image",
      id: "reply-image",
      name: "细节.svg",
      url: "data:image/svg+xml,%3Csvg/%3E",
    },
    { kind: "file", id: "reply-file", mimeType: "text/plain", size: 12 },
  ],
};

describe("http inbox non-text message adapter", () => {
  it("parses every stored body branch and omits optional fields the channel never provided", async () => {
    seed("stored-token");
    const bodies = [
      SERVER_IMAGE_BODY,
      SERVER_AUDIO_BODY,
      SERVER_FILE_BODY,
      SERVER_VIDEO_BODY,
      SERVER_LINK_BODY,
      SERVER_LOCATION_BODY,
      SERVER_QUOTE_BODY,
      SERVER_CARD_BODY,
      SERVER_UNKNOWN_BODY,
      SERVER_REPLY_BODY,
    ];
    const api = createHttpInboxApi({
      origin: ORIGIN,
      fetcher: async () =>
        envelope(
          messageData(
            bodies.map((body, index) => ({
              ...SERVER_INCOMING,
              id: String(9000 + index),
              sequence: 36 + index,
              body,
            })),
            null,
          ),
        ),
    });

    const page = await api.listMessages({
      context: CONTEXT,
      signal: signal(),
      conversationId: "41",
    });

    expect(page.items.map((message) => message.body)).toEqual([
      {
        type: "image",
        media: {
          kind: "image",
          id: "MEDIA_IMAGE",
          name: "云朵托特包.png",
          mimeType: "image/png",
          size: 1450,
          url: "https://mmbiz.qpic.cn/pic",
        },
      },
      { type: "audio", media: { kind: "audio", id: "MEDIA_VOICE" } },
      { type: "file", media: { kind: "file", id: "MEDIA_FILE", size: 42 } },
      {
        type: "video",
        media: {
          kind: "video",
          id: "4:0",
          url: "https://cdn.example.test/v.mp4",
        },
      },
      {
        type: "link",
        title: "活动页",
        url: "https://example.com/act",
        description: "限时活动",
      },
      {
        type: "location",
        label: "广州市海珠区客村",
        latitude: 23.134521,
        longitude: 113.358803,
      },
      {
        type: "quote",
        text: "是这一款米白色吗？",
        quotedText: "米白和雾灰两个颜色都可以先确认库存。",
        messageId: "37",
      },
      {
        type: "card",
        kind: "order",
        externalId: "ORDER-1",
        title: "订单卡片",
        url: "https://example.com/orders/1",
      },
      {
        type: "unknown",
        originalType: "sticker",
        explanation: "该渠道交互消息暂不支持完整展示",
        sourceUrl: "https://example.com/messages/sticker",
      },
      {
        type: "reply",
        text: "包身细节已补充",
        attachments: [
          {
            kind: "image",
            id: "reply-image",
            name: "细节.svg",
            url: "data:image/svg+xml,%3Csvg/%3E",
          },
          { kind: "file", id: "reply-file", mimeType: "text/plain", size: 12 },
        ],
      },
    ]);
  });

  it("never puts the token in a media URL and reads bytes with the index contract", async () => {
    seed("stored-token");
    const fetcher = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(String(url)).toBe(
          `${ORIGIN}/api/desk/messages/9001/media?index=1`,
        );
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer stored-token",
        );
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "Content-Type": "audio/mpeg" },
        });
      },
    );
    const api = createHttpInboxApi({ origin: ORIGIN, fetcher });

    const blob = await api.loadMessageMedia({
      context: CONTEXT,
      signal: signal(),
      messageId: "9001",
      index: 1,
    });

    expect(blob.type).toBe("audio/mpeg");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("surfaces media failures as ordinary R errors without inventing bytes", async () => {
    seed("stale-token");
    const api = createHttpInboxApi({
      origin: ORIGIN,
      fetcher: async () =>
        Response.json({
          code: 13100,
          msg: "微信素材读取失败：40007 invalid media_id",
          data: null,
        }),
    });

    await expect(
      api.loadMessageMedia({
        context: CONTEXT,
        signal: signal(),
        messageId: "9001",
        index: 0,
      }),
    ).rejects.toMatchObject({ kind: "business", code: 13100 });
  });
});
