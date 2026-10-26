import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { InboxMessage } from "@/features/inbox/types";
import { type Translation, translationApi } from "./api";
import { MessageTranslation } from "./message-translation";
import { TranslationProvider } from "./provider";

vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  translationApi: { preference: vi.fn(), save: vi.fn(), translate: vi.fn() },
}));
const message: InboxMessage = {
  id: "42",
  conversationId: "7",
  direction: "incoming",
  body: { type: "text", text: "Hello" },
  createdAt: "2026-10-26T10:00:00",
  sequence: 1,
  version: 1,
};
const result: Translation = {
  text: "你好",
  targetLanguage: "zh",
  serviceName: "测试服务",
  revision: 1,
};
const view = (value = message) => (
  <TranslationProvider>
    <p>{value.body.type === "text" ? value.body.text : ""}</p>
    <MessageTranslation message={value} />
  </TranslationProvider>
);
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(translationApi.preference).mockResolvedValue({
    automatic: false,
    targetLanguage: "zh",
  });
  vi.mocked(translationApi.translate).mockResolvedValue(result);
});

describe("消息阅读翻译", () => {
  it("默认手动，译文附加展示并可收起，保留原文", async () => {
    render(view());
    await act(async () => {});
    expect(translationApi.translate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "翻译" }));
    expect(
      await screen.findByRole("region", { name: "消息译文" }),
    ).toHaveTextContent("你好");
    expect(screen.getByText("Hello")).toBeVisible();
    expect(translationApi.translate).toHaveBeenCalledWith(
      "42",
      1,
      "zh",
      expect.any(AbortSignal),
    );
    fireEvent.click(screen.getByRole("button", { name: "收起译文" }));
    expect(
      screen.queryByRole("region", { name: "消息译文" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "显示译文" }));
    expect(translationApi.translate).toHaveBeenCalledTimes(1);
  });
  it("翻译失败明确显示并允许重新请求", async () => {
    vi.mocked(translationApi.translate).mockRejectedValueOnce(
      new Error("企业未配置服务"),
    );
    render(view());
    fireEvent.click(screen.getByRole("button", { name: "翻译" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "企业未配置服务",
    );
    fireEvent.click(screen.getByRole("button", { name: "重试翻译" }));
    expect(
      await screen.findByRole("region", { name: "消息译文" }),
    ).toHaveTextContent("你好");
    expect(translationApi.translate).toHaveBeenCalledTimes(2);
  });
  it("自动翻译合并同一消息的在途请求", async () => {
    vi.mocked(translationApi.preference).mockResolvedValue({
      automatic: true,
      targetLanguage: "zh",
    });
    let finish: (value: Translation) => void = () => {};
    vi.mocked(translationApi.translate).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(
      <TranslationProvider>
        <MessageTranslation message={message} />
        <MessageTranslation message={message} />
      </TranslationProvider>,
    );
    await waitFor(() =>
      expect(translationApi.translate).toHaveBeenCalledTimes(1),
    );
    await act(async () => finish(result));
    expect(screen.getAllByRole("region", { name: "消息译文" })).toHaveLength(2);
  });
  it("本地待发送及非文本消息没有翻译入口", () => {
    const { rerender } = render(
      view({
        ...message,
        id: "local-message",
        direction: "outgoing",
        delivery: { state: "sending" },
      }),
    );
    expect(
      screen.queryByRole("button", { name: "翻译" }),
    ).not.toBeInTheDocument();
    rerender(
      view({ ...message, body: { type: "unknown", originalType: "image" } }),
    );
    expect(
      screen.queryByRole("button", { name: "翻译" }),
    ).not.toBeInTheDocument();
  });
  it("消息版本变化后忽略旧请求的迟到译文", async () => {
    let finish: (value: Translation) => void = () => {};
    vi.mocked(translationApi.translate).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { rerender } = render(view());
    fireEvent.click(screen.getByRole("button", { name: "翻译" }));
    await waitFor(() =>
      expect(translationApi.translate).toHaveBeenCalledTimes(1),
    );
    rerender(view({ ...message, id: "43", version: 2 }));
    await act(async () => finish(result));
    expect(screen.queryByText("你好")).not.toBeInTheDocument();
  });
});
