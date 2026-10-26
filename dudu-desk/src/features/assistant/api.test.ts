import { describe, expect, it, vi } from "vitest";
import { assistantApi, parseAnswer, parseAvailability } from "./api";

describe("AI 助手接口契约", () => {
  it("拒绝无效回答和不完整的启用状态", () => {
    expect(
      parseAvailability({ enabled: false, serviceName: null }).enabled,
    ).toBe(false);
    expect(() =>
      parseAvailability({ enabled: true, serviceName: null }),
    ).toThrow();
    expect(() => parseAnswer({ visitorId: "20", text: "半个响应" })).toThrow();
  });
  it("不接收其他来访用户的回答", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          msg: "成功",
          data: {
            visitorId: "30",
            text: "其他会话",
            serviceName: "企业模型",
            revision: 1,
            contextMessageCount: 0,
            contextTruncated: false,
          },
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    try {
      await expect(
        assistantApi.ask(
          "20",
          { prompt: "问题", task: "chat", draft: "", history: [] },
          new AbortController().signal,
        ),
      ).rejects.toThrow();
    } finally {
      fetcher.mockRestore();
    }
  });
});
