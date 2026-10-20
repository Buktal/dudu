import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConsoleClient } from "@/api/client";
import { ConsoleContext } from "@/api/context";
import { AccountDetailPanel } from "./AccountDetailPanel";

const account = {
  companyChannelId: "1",
  groupId: "2",
  groupName: "原组",
  channel: "telegram",
  accountName: "客服机器人",
  receiveConfigured: true,
  sendConfigured: false,
  missingReceiveFields: [],
  missingSendFields: ["botToken"],
  createTime: "2026-10-20 00:00:00",
  updateTime: "2026-10-20 00:00:00",
  callbackUrl: "https://example.com/api/channels/1/callback",
  fields: {},
  configuredSecretFields: ["secretToken"],
  notes: [],
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
it("换组先确认历史可见性，候选只包含可管理目标组，提交独立 group 请求", async () => {
  const fetcher = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
    const data = String(url).endsWith("/login")
      ? {
          token: "console-token",
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
          profile: {
            company: { companyId: "100001", companyName: "企业" },
            user: {
              userId: "9",
              username: "manager",
              name: "管理员",
              role: "console",
              isInitialAdmin: false,
            },
            managedGroupIds: ["2", "3"],
          },
        }
      : account;
    return new Response(JSON.stringify({ code: 0, msg: "", data }));
  });
  vi.stubGlobal("fetch", fetcher);
  const client = new ConsoleClient();
  await client.login("100001", "manager", "password");
  const changed = vi.fn();
  render(
    <ConsoleContext value={client}>
      <AccountDetailPanel
        id="1"
        definitions={[]}
        groups={[
          { groupId: "2", groupName: "原组" },
          { groupId: "3", groupName: "目标组" },
          { groupId: "4", groupName: "不可管理组" },
        ]}
        onClose={vi.fn()}
        onChanged={changed}
      />
    </ConsoleContext>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "调整所属组" }));
  expect(screen.getByText(/全部历史的访问/)).toBeInTheDocument();
  expect(
    screen.queryByRole("option", { name: /不可管理组/ }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("目标用户组"), {
    target: { value: "3" },
  });
  fireEvent.click(screen.getByRole("button", { name: "确认换组" }));
  expect(await screen.findByText("请确认历史可见性变化")).toBeInTheDocument();
  expect(
    fetcher.mock.calls.filter(([url]) => String(url).endsWith("/group")),
  ).toHaveLength(0);
  fireEvent.click(screen.getByLabelText("我已确认历史可见性将随所属组变化"));
  fireEvent.click(screen.getByRole("button", { name: "确认换组" }));
  await waitFor(() => expect(changed).toHaveBeenCalled());
  const request = fetcher.mock.calls.find(([url]) =>
    String(url).endsWith("/group"),
  );
  expect(request?.[0]).toBe("/api/console/company_channels/1/group");
  expect(request?.[1]?.method).toBe("PUT");
  expect(JSON.parse(String(request?.[1]?.body))).toEqual({ groupId: "3" });
});
it("不可见账号关闭失效详情", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ code: 12100, msg: "账号不可见", data: null }),
        ),
    ),
  );
  const closed = vi.fn();
  render(
    <ConsoleContext value={new ConsoleClient()}>
      <AccountDetailPanel
        id="1"
        definitions={[]}
        groups={[]}
        onClose={closed}
        onChanged={vi.fn()}
      />
    </ConsoleContext>,
  );
  await waitFor(() => expect(closed).toHaveBeenCalled());
});
