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
import { installHttp, success } from "@/test/http";
import { ChannelAccountsPage } from "./ChannelAccountsPage";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it("路由 groupId 只作初始筛选种子：重置清掉筛选且不回写 URL", async () => {
  window.location.hash = "/channel-accounts?groupId=2";
  const bodies: Array<Record<string, unknown>> = [];
  installHttp((url, init) => {
    if (url.pathname === "/api/console/company_channels/query") {
      bodies.push(JSON.parse(String(init.body)));
      return success({ list: [], total: 0, page: 1, pageSize: 20 });
    }
    if (url.pathname === "/api/console/channels")
      return success({ channels: [] });
    return success({ list: [], total: 0, page: 1, pageSize: 100 });
  });
  render(
    <ConsoleContext value={new ConsoleClient()}>
      <ChannelAccountsPage
        selectedId={null}
        creating={false}
        groupId="2"
        onSelect={vi.fn()}
        onCreate={vi.fn()}
      />
    </ConsoleContext>,
  );
  await waitFor(() =>
    expect(bodies[0]).toMatchObject({ groupId: "2", page: 1 }),
  );
  fireEvent.click(await screen.findByRole("button", { name: "重置" }));
  await waitFor(() =>
    expect(bodies[bodies.length - 1]).not.toHaveProperty("groupId"),
  );
  // 入口种子语义：深链参数保留在地址里，刷新后仍按该组进入筛选态
  expect(window.location.hash).toBe("#/channel-accounts?groupId=2");
});
