import { describe, expect, it } from "vitest";
import {
  assetPurposeOf,
  describeMessageBody,
  mediaLabel,
  messageSummary,
} from "./message-content";
import type { MediaReference, MessageBody } from "./types";

function media(overrides: Partial<MediaReference> = {}): MediaReference {
  return {
    id: "media-1",
    kind: "image",
    name: "photo.png",
    mimeType: "image/png",
    size: 1024,
    url: "https://example.com/photo.png",
    ...overrides,
  };
}

describe("messageSummary", () => {
  it("keeps the text and quote copy verbatim", () => {
    expect(messageSummary({ type: "text", text: "你好" })).toBe("你好");
    expect(
      messageSummary({ type: "quote", text: "好的", quotedText: "原文" }),
    ).toBe("好的");
  });

  it("summarizes a reply by text first, attachments second", () => {
    expect(
      messageSummary({ type: "reply", text: "收到", attachments: [] }),
    ).toBe("收到");
    expect(
      messageSummary({
        type: "reply",
        text: "",
        attachments: [media({ name: "a.png" }), media({ name: "b.pdf" })],
      }),
    ).toBe("[附件] a.png、[附件] b.pdf");
  });

  it("keeps the kind label when the channel provided no file name", () => {
    expect(
      messageSummary({ type: "image", media: { kind: "image", id: "m1" } }),
    ).toBe("[图片]");
    expect(
      messageSummary({
        type: "reply",
        text: "",
        attachments: [{ kind: "file", id: "a" }],
      }),
    ).toBe("[附件] 文件");
  });

  it("prefixes single-media bodies with the kind label", () => {
    const cases: { body: MessageBody; expected: string }[] = [
      { body: { type: "image", media: media() }, expected: "[图片] photo.png" },
      {
        body: { type: "audio", media: media({ name: "voice.mp3" }) },
        expected: "[音频] voice.mp3",
      },
      {
        body: { type: "video", media: media({ name: "clip.mp4" }) },
        expected: "[视频] clip.mp4",
      },
      {
        body: { type: "file", media: media({ name: "doc.pdf" }) },
        expected: "[文件] doc.pdf",
      },
    ];
    for (const { body, expected } of cases) {
      expect(messageSummary(body)).toBe(expected);
    }
  });

  it("covers link, location, card and unknown copy", () => {
    expect(
      messageSummary({
        type: "link",
        title: "订单",
        url: "https://example.com/order",
      }),
    ).toBe("[链接] 订单");
    expect(
      messageSummary({ type: "link", url: "https://example.com/order" }),
    ).toBe("[链接] https://example.com/order");
    expect(
      messageSummary({
        type: "location",
        label: "大楼",
        latitude: 1,
        longitude: 2,
      }),
    ).toBe("[位置] 大楼");
    expect(
      messageSummary({ type: "location", latitude: 1, longitude: 2 }),
    ).toBe("[位置] 1, 2");
    expect(
      messageSummary({ type: "card", kind: "order", title: "订单详情" }),
    ).toBe("[order] 订单详情");
    expect(
      messageSummary({ type: "card", kind: "order", externalId: "A7" }),
    ).toBe("[order] A7");
    expect(messageSummary({ type: "card", kind: "order" })).toBe(
      "[order] 详情未提供",
    );
    expect(messageSummary({ type: "unknown", originalType: "sticker" })).toBe(
      "[暂不支持的消息] sticker",
    );
  });
});

describe("describeMessageBody", () => {
  it("derives the summary through the same seam as messageSummary", () => {
    const bodies: MessageBody[] = [
      { type: "text", text: "你好" },
      { type: "image", media: media() },
      { type: "link", url: "https://example.com/order" },
      { type: "unknown", originalType: "sticker" },
    ];
    for (const body of bodies) {
      expect(describeMessageBody(body).summary).toBe(messageSummary(body));
    }
  });

  it("extracts media once: single, reply attachments, or none", () => {
    const single = media();
    expect(describeMessageBody({ type: "image", media: single }).media).toEqual(
      [single],
    );
    const attachments = [media({ id: "a" }), media({ id: "b" })];
    expect(
      describeMessageBody({ type: "reply", text: "", attachments }).media,
    ).toEqual(attachments);
    const withoutMedia: MessageBody[] = [
      { type: "text", text: "hi" },
      { type: "link", url: "https://example.com" },
      { type: "location", latitude: 1, longitude: 2 },
      { type: "quote", text: "ok" },
      { type: "card", kind: "order" },
      { type: "unknown", originalType: "sticker" },
    ];
    for (const body of withoutMedia) {
      expect(describeMessageBody(body).media).toEqual([]);
    }
  });

  it("extracts the external URL once, rejecting unsafe sources", () => {
    expect(
      describeMessageBody({
        type: "link",
        url: "https://example.com/order?id=7",
      }).externalUrl,
    ).toBe("https://example.com/order?id=7");
    expect(
      describeMessageBody({ type: "link", url: "javascript:alert(1)" })
        .externalUrl,
    ).toBeNull();
    expect(
      describeMessageBody({
        type: "card",
        kind: "order",
        url: "https://example.com/order",
      }).externalUrl,
    ).toBe("https://example.com/order");
    expect(
      describeMessageBody({ type: "card", kind: "order" }).externalUrl,
    ).toBeNull();
    expect(
      describeMessageBody({
        type: "unknown",
        originalType: "sticker",
        sourceUrl: "https://example.com/source",
      }).externalUrl,
    ).toBe("https://example.com/source");
    expect(
      describeMessageBody({ type: "unknown", originalType: "sticker" })
        .externalUrl,
    ).toBeNull();
    expect(
      describeMessageBody({ type: "text", text: "hi" }).externalUrl,
    ).toBeNull();
  });
});

describe("media kind seam", () => {
  it("labels every kind with the established copy", () => {
    expect(mediaLabel("image")).toBe("图片");
    expect(mediaLabel("audio")).toBe("音频");
    expect(mediaLabel("video")).toBe("视频");
    expect(mediaLabel("file")).toBe("文件");
  });

  it("maps kinds to asset purposes, collapsing file to download", () => {
    expect(assetPurposeOf("image")).toBe("image");
    expect(assetPurposeOf("audio")).toBe("audio");
    expect(assetPurposeOf("video")).toBe("video");
    expect(assetPurposeOf("file")).toBe("download");
  });
});
