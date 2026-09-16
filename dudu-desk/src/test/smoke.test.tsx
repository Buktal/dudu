import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/components/theme-provider";
import { InboxWorkspace, unavailableInboxApi } from "@/features/inbox";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Desk application smoke", () => {
  it("opens the production workspace with explicit unavailable service and no fixture conversations", async () => {
    vi.stubGlobal("matchMedia", (media: string) => ({
      media,
      matches: false,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }));
    render(
      <ThemeProvider>
        <InboxWorkspace api={unavailableInboxApi} />
      </ThemeProvider>,
    );
    expect(
      await screen.findByRole("heading", { name: "消息" }),
    ).toBeInTheDocument();
    expect(await screen.findAllByText("接待服务未连接")).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: "并排模式" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "卡片模式" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "主题色，当前杏桃橙" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^接待 / }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "发送" }),
    ).not.toBeInTheDocument();
  });
});
