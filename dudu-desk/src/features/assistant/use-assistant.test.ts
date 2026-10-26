import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AssistantAnswer, assistantApi } from "./api";
import { historyFor, useAssistant } from "./use-assistant";

vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  assistantApi: { availability: vi.fn(), ask: vi.fn() },
}));
const first = { id: "20", name: "林", channel: "微信公众号" };
const second = { id: "30", name: "周", channel: "Telegram" };
const answer: AssistantAnswer = {
  visitorId: "20",
  text: "请提供订单号",
  serviceName: "企业模型",
  revision: 1,
  contextMessageCount: 3,
  contextTruncated: false,
};
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(assistantApi.availability).mockResolvedValue({
    enabled: true,
    serviceName: "企业模型",
  });
  vi.mocked(assistantApi.ask).mockResolvedValue(answer);
});

describe("悬浮 AI 对话生命周期", () => {
  it("离开当前来访用户后，迟到结果只回到原对话", async () => {
    let finish: (value: AssistantAnswer) => void = () => {};
    vi.mocked(assistantApi.ask).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const { result, rerender } = renderHook(
      ({ target }) => useAssistant(target, "原草稿", vi.fn()),
      { initialProps: { target: first } },
    );
    act(() => result.current.setOpen(true));
    await waitFor(() =>
      expect(result.current.availability?.enabled).toBe(true),
    );
    act(() => result.current.ask("拟一条回复", "reply"));
    rerender({ target: second });
    await act(async () => finish(answer));
    expect(result.current.thread.exchanges).toHaveLength(0);
    rerender({ target: first });
    expect(result.current.thread.exchanges[0].answer?.text).toBe(answer.text);
    expect(assistantApi.ask).toHaveBeenCalledWith(
      "20",
      expect.objectContaining({ draft: "原草稿" }),
      expect.any(AbortSignal),
    );
  });
  it("取消和卸载会取消请求，新工作区不接收旧回答", async () => {
    vi.mocked(assistantApi.ask).mockImplementation(() => new Promise(() => {}));
    const { result, unmount } = renderHook(() =>
      useAssistant(first, "", vi.fn()),
    );
    act(() => result.current.setOpen(true));
    await waitFor(() =>
      expect(result.current.availability?.enabled).toBe(true),
    );
    act(() => result.current.ask("总结会话", "summary"));
    const signal = vi.mocked(assistantApi.ask).mock.calls[0][2];
    act(() => result.current.cancel());
    expect(signal.aborted).toBe(true);
    expect(result.current.thread.exchanges[0].status).toBe("cancelled");
    act(() => result.current.ask("再试一次"));
    const next = vi.mocked(assistantApi.ask).mock.calls[1][2];
    unmount();
    expect(next.aborted).toBe(true);
  });
  it("失败后重试复用该轮，采纳只编辑草稿且可撤销", async () => {
    vi.mocked(assistantApi.ask)
      .mockRejectedValueOnce(new Error("模型暂不可用"))
      .mockResolvedValue(answer);
    const apply = vi.fn(() => true);
    const { result, rerender } = renderHook(
      ({ draft }) => useAssistant(first, draft, apply),
      { initialProps: { draft: "原草稿" } },
    );
    act(() => result.current.setOpen(true));
    await waitFor(() =>
      expect(result.current.availability?.enabled).toBe(true),
    );
    act(() => result.current.ask("请拟回复", "reply"));
    await waitFor(() =>
      expect(result.current.thread.exchanges[0].status).toBe("error"),
    );
    const exchangeId = result.current.thread.exchanges[0].id;
    act(() => result.current.ask("请拟回复", "reply", exchangeId));
    await waitFor(() =>
      expect(result.current.thread.exchanges[0].status).toBe("ready"),
    );
    expect(result.current.thread.exchanges).toHaveLength(1);
    act(() => result.current.apply(answer.text));
    expect(apply).toHaveBeenCalledWith("20", answer.text, "原草稿");
    expect(result.current.open).toBe(false);
    rerender({ draft: answer.text });
    expect(result.current.canUndo).toBe(true);
    act(() => result.current.undo());
    expect(apply).toHaveBeenLastCalledWith("20", "原草稿", answer.text);
    expect(result.current.canUndo).toBe(false);
  });
  it("配置未启用时不调用模型，刷新后可启用", async () => {
    vi.mocked(assistantApi.availability)
      .mockResolvedValueOnce({ enabled: false, serviceName: null })
      .mockResolvedValue({ enabled: true, serviceName: "企业模型" });
    const { result } = renderHook(() => useAssistant(first, "", vi.fn()));
    act(() => result.current.setOpen(true));
    await waitFor(() =>
      expect(result.current.availability?.enabled).toBe(false),
    );
    act(() => result.current.ask("测试"));
    expect(assistantApi.ask).not.toHaveBeenCalled();
    act(() => result.current.refresh());
    await waitFor(() =>
      expect(result.current.availability?.enabled).toBe(true),
    );
    expect(result.current.loading).toBe(false);
  });
  it("多轮请求携带完整的近期问答并排除失败轮次", () => {
    expect(
      historyFor([
        { id: 1, prompt: "旧问题", task: "chat", status: "error" },
        { id: 2, prompt: "怎么回复", task: "reply", status: "ready", answer },
      ]),
    ).toEqual([
      { role: "user", content: "怎么回复" },
      { role: "assistant", content: answer.text },
    ]);
  });
});
