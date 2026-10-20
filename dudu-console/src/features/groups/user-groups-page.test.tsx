import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleClient } from "@/api/client";
import { ConsoleContext } from "@/api/context";
import { UserGroupsPage } from "./user-groups-page";

const group = {
  groupId: "8",
  groupName: "售后组",
  memberCount: 2,
  channelAccountCount: 1,
  createTime: "2026-10-20 10:00:00",
  updateTime: "2026-10-20 10:00:00",
};
afterEach(() => vi.restoreAllMocks());
describe("用户组页面操作", () => {
  it("搜索提交前保留草稿，打开组通过页面选择接口", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            code: 0,
            msg: "ok",
            list: [group],
            total: 1,
            page: 1,
            pageSize: 20,
          }),
        ),
    );
    const selected = vi.fn();
    render(
      <ConsoleContext value={new ConsoleClient()}>
        <UserGroupsPage
          selectedId={null}
          creating={false}
          onSelect={selected}
          onCreate={vi.fn()}
        />
      </ConsoleContext>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "售后组" }));
    expect(selected).toHaveBeenCalledWith("8");
    const calls = fetcher.mock.calls.length;
    fireEvent.change(screen.getByLabelText("搜索组名"), {
      target: { value: "  售后  " },
    });
    expect(fetcher.mock.calls.length).toBe(calls);
    fireEvent.submit(screen.getByRole("form", { name: "用户组筛选" }));
    await waitFor(() =>
      expect(
        JSON.parse(
          String(fetcher.mock.calls[fetcher.mock.calls.length - 1]?.[1]?.body),
        ),
      ).toMatchObject({ keyword: "售后", page: 1 }),
    );
  });
  it("服务失败显示错误而不是没有用户组", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ code: 12200, msg: "用户组读取失败", data: null }),
        ),
    );
    render(
      <ConsoleContext value={new ConsoleClient()}>
        <UserGroupsPage
          selectedId={null}
          creating={false}
          onSelect={vi.fn()}
          onCreate={vi.fn()}
        />
      </ConsoleContext>,
    );
    expect(await screen.findByText("用户组读取失败")).toBeInTheDocument();
    expect(screen.queryByText("暂无可管理的用户组")).not.toBeInTheDocument();
  });
});
