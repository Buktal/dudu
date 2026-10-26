import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { assistantApi } from "./api";
import { FloatingAssistant } from "./floating-assistant";

vi.mock("./api", async (original) => ({
  ...(await original<typeof import("./api")>()),
  assistantApi: { availability: vi.fn(), ask: vi.fn() },
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("完整对话弹层承载助手入口，配置就绪后可输入，Esc 只收起助手", async () => {
  vi.mocked(assistantApi.availability).mockResolvedValue({
    enabled: true,
    serviceName: "企业模型",
  });
  const host = document.createElement("div");
  host.setAttribute("role", "dialog");
  document.body.append(host);
  const outsideKey = vi.fn();
  host.addEventListener("keydown", outsideKey);
  try {
    render(
      <FloatingAssistant
        container={host}
        target={{ id: "20", name: "林", channel: "公众号" }}
        draft=""
        onApply={vi.fn()}
      />,
    );
    fireEvent.click(
      within(host).getByRole("button", { name: "展开悬浮 AI 助手" }),
    );
    const region = within(host).getByRole("region", { name: "AI 助手" });
    const input = within(region).getByRole("textbox", { name: "向 AI 提问" });
    await waitFor(() => {
      expect(input).toBeEnabled();
      expect(document.activeElement).toBe(input);
    });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(within(host).queryByRole("region", { name: "AI 助手" })).toBeNull();
    expect(outsideKey).not.toHaveBeenCalled();
    expect(
      within(host).getByRole("button", { name: "展开悬浮 AI 助手" }),
    ).toBeInTheDocument();
  } finally {
    cleanup();
    host.remove();
  }
});
