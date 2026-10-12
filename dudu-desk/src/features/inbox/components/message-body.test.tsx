import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { testStore } from "../stores/test-support";
import type { MessageBody as Body } from "../types";
import { MessageBody } from "./message-body";

afterEach(cleanup);
beforeEach(() => {
  vi.unstubAllGlobals();
});

function show(body: Body, api: Parameters<typeof testStore>[0] = {}) {
  // 每条消息独立渲染：断言只针对当前消息气泡，不与上一条重复
  cleanup();
  const loadMessageMedia = api.loadMessageMedia ?? vi.fn();
  const store = testStore({ ...api, loadMessageMedia });
  render(
    <Provider store={store}>
      <MessageBody body={body} messageId="9001" />
    </Provider>,
  );
  return { store, loadMessageMedia };
}

function stubObjectUrl(value = "blob:http://localhost/fetched") {
  const NativeUrl = URL;
  vi.stubGlobal(
    "URL",
    class extends NativeUrl {
      static createObjectURL() {
        return value;
      }
      static revokeObjectURL() {}
    },
  );
}

it("renders each stored body with the fields the channel actually provided", () => {
  show({ type: "text", text: "还想问问保修" });
  expect(screen.getByText("还想问问保修")).toBeInTheDocument();

  show({
    type: "image",
    media: {
      kind: "image",
      id: "m1",
      name: "云朵.svg",
      url: "https://img.example/1.svg",
    },
  });
  const image = screen.getByRole("img");
  expect(image).toHaveAttribute("src", "https://img.example/1.svg");
  expect(image).toHaveAttribute("alt", "云朵.svg");

  show({
    type: "audio",
    media: {
      kind: "audio",
      id: "m2",
      name: "语音.wav",
      url: "https://cdn.example/a.wav",
    },
  });
  expect(screen.getByLabelText("语音.wav")).toHaveAttribute(
    "src",
    "https://cdn.example/a.wav",
  );

  show({
    type: "video",
    media: { kind: "video", id: "m3", url: "https://cdn.example/v.mp4" },
  });
  expect(screen.getByLabelText("视频")).toHaveAttribute(
    "src",
    "https://cdn.example/v.mp4",
  );

  show({
    type: "file",
    media: {
      kind: "file",
      id: "m4",
      name: "说明.txt",
      size: 42,
      url: "data:text/plain,ok",
    },
  });
  expect(screen.getByText("说明.txt")).toBeInTheDocument();
  expect(screen.getByText("文件 · 42 B")).toBeInTheDocument();

  show({
    type: "link",
    title: "活动页",
    url: "https://example.com/act",
    description: "限时活动",
  });
  expect(screen.getByText("活动页")).toBeInTheDocument();
  expect(screen.getByText("限时活动")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /打开链接/ })).toHaveAttribute(
    "href",
    "https://example.com/act",
  );

  show({
    type: "location",
    label: "广州市海珠区客村",
    latitude: 23.134521,
    longitude: 113.358803,
  });
  expect(screen.getByText("广州市海珠区客村")).toBeInTheDocument();
  expect(screen.getByText("23.134521, 113.358803")).toBeInTheDocument();

  show({
    type: "quote",
    text: "可以",
    quotedText: "能发货吗",
  });
  expect(screen.getByText("可以")).toBeInTheDocument();
  expect(screen.getByText("能发货吗")).toBeInTheDocument();

  show({
    type: "card",
    kind: "order",
    externalId: "ORDER-1",
    title: "订单卡片",
    url: "https://example.com/orders/1",
  });
  expect(screen.getByText("订单卡片")).toBeInTheDocument();
  expect(screen.getByText("order")).toBeInTheDocument();
  expect(screen.getByText("编号：ORDER-1")).toBeInTheDocument();

  show({ type: "unknown", originalType: "sticker" });
  expect(screen.getByText("暂不支持的消息 · sticker")).toBeInTheDocument();
  expect(
    screen.getByText("已保留这条来信，详情暂不可读。"),
  ).toBeInTheDocument();

  show({
    type: "reply",
    text: "细节见附件",
    attachments: [
      {
        kind: "image",
        id: "r1",
        name: "细节.svg",
        url: "data:image/svg+xml,%3Csvg/%3E",
      },
    ],
  });
  expect(screen.getByText("细节见附件")).toBeInTheDocument();
  expect(screen.getByRole("img")).toHaveAttribute("alt", "细节.svg");
});

it("omits optional media fields the channel never provided instead of filling placeholders", () => {
  show({
    type: "image",
    media: { kind: "image", id: "m1", url: "https://img.example/1.png" },
  });
  expect(screen.getByRole("img")).toHaveAttribute("alt", "图片");

  show({ type: "file", media: { kind: "file", id: "m4" } });
  expect(screen.getByText("文件")).toBeInTheDocument();
  expect(screen.getByText("文件 · 大小未知")).toBeInTheDocument();

  show({
    type: "location",
    latitude: Number.NaN,
    longitude: Number.NaN,
  });
  expect(screen.getByText("位置")).toBeInTheDocument();
  expect(screen.getByText("渠道未提供有效坐标")).toBeInTheDocument();
});

it("loads media that only has a channel identifier through the authenticated API", async () => {
  stubObjectUrl("blob:http://localhost/media-9001:0");
  const loadMessageMedia = vi.fn(
    async () => new Blob(["wav"], { type: "audio/wav" }),
  );
  show(
    { type: "audio", media: { kind: "audio", id: "MEDIA_VOICE" } },
    { loadMessageMedia },
  );

  await waitFor(() =>
    expect(screen.getByLabelText("音频")).toHaveAttribute(
      "src",
      "blob:http://localhost/media-9001:0",
    ),
  );
  expect(loadMessageMedia).toHaveBeenCalledWith(
    expect.objectContaining({ messageId: "9001", index: 0 }),
  );
});

it("selects reply attachments by their array index for the media endpoint", async () => {
  stubObjectUrl();
  const indexed: number[] = [];
  const loadMessageMedia = vi.fn(async (input: { index: number }) => {
    indexed.push(input.index);
    return new Blob(["ok"]);
  });
  show(
    {
      type: "reply",
      text: "两个附件",
      attachments: [
        { kind: "file", id: "ATT_A" },
        { kind: "file", id: "ATT_B" },
      ],
    },
    { loadMessageMedia },
  );

  await waitFor(() => expect(loadMessageMedia).toHaveBeenCalledTimes(2));
  expect(indexed).toEqual([0, 1]);
});

it("keeps the existing failure hint when media bytes cannot be read", async () => {
  stubObjectUrl();
  const loadMessageMedia = vi.fn(async () => {
    throw new Error("渠道素材已失效");
  });
  show(
    { type: "video", media: { kind: "video", id: "EXPIRED" } },
    { loadMessageMedia },
  );

  await waitFor(() =>
    expect(screen.getByText("素材暂不可读取")).toBeInTheDocument(),
  );
});

it("uses a public link directly and never reads it through the media endpoint", () => {
  const loadMessageMedia = vi.fn();
  show(
    {
      type: "image",
      media: {
        kind: "image",
        id: "MEDIA_IMAGE",
        url: "https://mmbiz.qpic.cn/pic",
      },
    },
    { loadMessageMedia },
  );

  expect(screen.getByRole("img")).toHaveAttribute(
    "src",
    "https://mmbiz.qpic.cn/pic",
  );
  expect(loadMessageMedia).not.toHaveBeenCalled();
});
