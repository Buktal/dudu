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
import { failure, installHttp, profile, success } from "@/test/http";
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
  // 受限身份：按组管理的企业管理员，仅管理 2、3 两组
  const fetcher = installHttp(() => success(account), {
    token: "console-token",
    profile: {
      ...profile,
      user: { ...profile.user, isInitialAdmin: false },
      managedGroupIds: ["2", "3"],
    },
  });
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
        notify={changed}
      />
    </ConsoleContext>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "调整所属组" }));
  expect(screen.getByText(/全部历史的访问/)).toBeInTheDocument();
  expect(
    screen.queryByRole("option", { name: /不可管理组/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("combobox", { name: "目标用户组" }));
  fireEvent.pointerDown(
    await screen.findByRole("option", { name: "目标组 · 3" }),
  );
  fireEvent.click(screen.getByRole("option", { name: "目标组 · 3" }), {
    detail: 1,
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
  installHttp(() => failure(12100, "账号不可见"));
  const closed = vi.fn();
  render(
    <ConsoleContext value={new ConsoleClient()}>
      <AccountDetailPanel
        id="1"
        definitions={[]}
        groups={[]}
        onClose={closed}
        notify={vi.fn()}
      />
    </ConsoleContext>,
  );
  await waitFor(() => expect(closed).toHaveBeenCalled());
});

it("保存时账号不可见会卸载凭据编辑器并重新读取详情", async () => {
  let invalidated = false;
  // 写命令携带登录态：未登录的裸 client 不会触发 12100 的权限失效重查
  const fetcher = installHttp((_url, init) => {
    if (init?.method === "PUT") invalidated = true;
    return invalidated ? failure(12100, "账号不可见") : success(account);
  });
  const client = new ConsoleClient();
  await client.login("100001", "manager", "password");
  const closed = vi.fn();
  render(
    <ConsoleContext value={client}>
      <AccountDetailPanel
        id="1"
        definitions={[
          {
            channel: "telegram",
            name: "Telegram",
            available: true,
            restriction: "",
            notes: [],
            fields: [
              {
                key: "secretToken",
                label: "回调秘密",
                secret: true,
                control: "password",
                requiredForReceive: true,
                requiredForSend: false,
                immutableOnceConfigured: false,
              },
            ],
          },
        ]}
        groups={[]}
        onClose={closed}
        notify={vi.fn()}
      />
    </ConsoleContext>,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "维护名称与凭据" }),
  );
  fireEvent.change(screen.getByLabelText("回调秘密 · 接收必需"), {
    target: { value: "replacement-secret" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存参数" }));
  await waitFor(() => expect(closed).toHaveBeenCalled());
  expect(
    screen.queryByLabelText("回调秘密 · 接收必需"),
  ).not.toBeInTheDocument();
  await waitFor(() =>
    expect(
      fetcher.mock.calls.filter(
        ([url, init]) =>
          !String(url).endsWith("/login") &&
          (!init?.method || init.method === "GET"),
      ),
    ).toHaveLength(2),
  );
});
