import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "@/App";
import { ThemeProvider } from "@/components/theme-provider";
import type { AccountApi } from "@/features/account";
import {
  type InboxApi,
  InboxWorkspace,
  unavailableInboxApi,
} from "@/features/inbox";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Desk application smoke", () => {
  it("signs out, cancels inbox work and signs in with a fresh work context", async () => {
    vi.stubGlobal("matchMedia", (media: string) => ({
      media,
      matches: media === "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    }));
    let queueSignal: AbortSignal | undefined;
    const contexts: { agentId: string; workspaceId: string }[] = [];
    const unsubscribe = vi.fn();
    const signOut = vi.fn(async () => {});
    const signIn = vi.fn(async () => ({
      agent: {
        id: "agent-next",
        name: "下一位坐席",
        username: "next.agent",
        roleName: "客服坐席",
      },
      workspace: { id: "service-next", name: "另一工作台" },
    }));
    const accountApi: AccountApi = {
      getSession: async () => ({
        agent: {
          id: "agent-session",
          name: "当前坐席",
          username: "agent",
          roleName: "客服坐席",
        },
        workspace: { id: "service-session", name: "当前工作台" },
      }),
      signIn,
      signOut,
    };
    const inboxApi: InboxApi = {
      ...unavailableInboxApi,
      listConversations: ({ signal, context }) => {
        contexts.push(context);
        queueSignal = signal;
        return new Promise((_, reject) =>
          signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        );
      },
      subscribe: ({ onConnection }) => {
        onConnection("connected");
        return unsubscribe;
      },
    };
    render(
      <ThemeProvider>
        <App accountApi={accountApi} inboxApi={inboxApi} />
      </ThemeProvider>,
    );
    await screen.findByRole("heading", { name: "我的会话" });
    const accountTrigger = await screen.findByRole("button", {
      name: "坐席账户：当前坐席",
    });
    fireEvent.click(accountTrigger);
    fireEvent.click(await screen.findByRole("menuitem", { name: "退出登录" }));
    const dialog = await screen.findByRole("dialog", { name: "退出登录" });
    expect(queueSignal?.aborted).toBe(false);
    fireEvent.click(within(dialog).getByRole("button", { name: "退出登录" }));
    expect(
      await screen.findByRole("heading", { name: "登录嘟嘟 Desk" }),
    ).toBeInTheDocument();
    expect(signOut).toHaveBeenCalledOnce();
    await waitFor(() => expect(unsubscribe).toHaveBeenCalledOnce());
    expect(queueSignal?.aborted).toBe(true);
    expect(
      screen.queryByRole("button", { name: "坐席账户：当前坐席" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("账号"), {
      target: { value: "next.agent" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "private password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await screen.findByRole("heading", { name: "我的会话" });
    expect(
      screen.getByRole("button", { name: "坐席账户：下一位坐席" }),
    ).toBeInTheDocument();
    expect(signIn).toHaveBeenCalledWith(
      { username: "next.agent", password: "private password" },
      expect.any(AbortSignal),
    );
    expect(contexts).toEqual([
      { agentId: "agent-session", workspaceId: "service-session" },
      { agentId: "agent-next", workspaceId: "service-next" },
    ]);
    expect(queueSignal?.aborted).toBe(false);
  });

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
      await screen.findByRole("heading", { name: "我的会话" }),
    ).toBeInTheDocument();
    expect(await screen.findAllByText("接待服务未连接")).not.toHaveLength(0);
    expect(screen.getByRole("button", { name: "并排模式" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "卡片模式" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "主题色，当前极昼白" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^接待 / }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "发送" }),
    ).not.toBeInTheDocument();
  });
});
