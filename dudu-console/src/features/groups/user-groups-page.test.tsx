import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleClient } from "@/api/client";
import { ConsoleContext } from "@/api/context";
import { deferred, failure, installHttp, success } from "@/test/http";
import { UserGroupsPage } from "./user-groups-page";

const group = {
  groupId: "8",
  groupName: "售后组",
  memberCount: 2,
  channelAccountCount: 1,
  createTime: "2026-10-20 10:00:00",
  updateTime: "2026-10-20 10:00:00",
};
const candidate = {
  userId: "3",
  username: "staff",
  name: "张三",
  role: "user",
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("用户组页面操作", () => {
  it("组详情提供可识别的页签并切换到渠道账号", async () => {
    installHttp((url) =>
      url.pathname.endsWith("/user_groups/8")
        ? success(group)
        : success({ list: [], total: 0, page: 1, pageSize: 20 }),
    );
    render(
      <ConsoleContext value={new ConsoleClient()}>
        <UserGroupsPage
          selectedId="8"
          creating={false}
          onSelect={vi.fn()}
          onCreate={vi.fn()}
        />
      </ConsoleContext>,
    );
    const members = await screen.findByRole("tab", { name: "成员" });
    expect(members).toHaveAttribute("aria-selected", "true");
    const accounts = screen.getByRole("tab", { name: "渠道账号" });
    fireEvent.click(accounts);
    expect(accounts).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "渠道账号" })).toBeVisible();
    expect(screen.getByRole("button", { name: "添加渠道账号" })).toBeVisible();
  });
  it("搜索提交前保留草稿，打开组通过页面选择接口", async () => {
    const fetcher = installHttp(() =>
      success({ list: [group], total: 1, page: 1, pageSize: 20 }),
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
    installHttp(() => failure(12200, "用户组读取失败"));
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
  it("内层弹层提交中外层详情不收起，提交完成后守卫放行", async () => {
    const add = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init: RequestInit) => {
        const url = new URL(String(input), window.location.href);
        if (
          url.pathname.endsWith("/user_groups/8") &&
          (init.method ?? "GET") === "GET"
        )
          return Promise.resolve(success(group));
        if (url.pathname.endsWith("/member_candidates"))
          return Promise.resolve(
            success({ list: [candidate], total: 1, page: 1, pageSize: 20 }),
          );
        if (url.pathname.endsWith("/members/3")) return add.promise;
        return Promise.resolve(
          success({ list: [], total: 0, page: 1, pageSize: 20 }),
        );
      }),
    );
    const onSelect = vi.fn();
    render(
      <ConsoleContext value={new ConsoleClient()}>
        <UserGroupsPage
          selectedId="8"
          creating={false}
          onSelect={onSelect}
          onCreate={vi.fn()}
        />
      </ConsoleContext>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "添加成员" }));
    fireEvent.click(await screen.findByRole("button", { name: "添加" }));
    // 添加成员提交挂起：外层遮罩与 Esc 的关闭尝试都不收起任何一层
    expect(
      screen.getByRole("button", { name: "正在添加" }),
    ).toBeInTheDocument();
    const overlay = document.querySelector('[data-slot="sheet-overlay"]');
    if (overlay) fireEvent.click(overlay);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(
      screen.getByRole("button", { name: "正在添加" }),
    ).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();

    // 提交收敛后内层可关闭，外层守卫随之放行
    await act(async () =>
      add.resolve(success({ groupId: "8", userId: "3", member: true })),
    );
    expect(await screen.findByRole("button", { name: "添加" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "完成" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "完成" }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(null));
  });
  it("移除成员提交中外层详情同样不收起，完成移除后可正常关闭", async () => {
    const remove = deferred<Response>();
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request, init: RequestInit) => {
        const url = new URL(String(input), window.location.href);
        if (
          url.pathname.endsWith("/user_groups/8") &&
          (init.method ?? "GET") === "GET"
        )
          return Promise.resolve(success(group));
        if (url.pathname.endsWith("/members/3") && init.method === "DELETE")
          return remove.promise;
        return Promise.resolve(
          success({
            list: [{ ...candidate, status: 1 }],
            total: 1,
            page: 1,
            pageSize: 20,
          }),
        );
      }),
    );
    const onSelect = vi.fn();
    render(
      <ConsoleContext value={new ConsoleClient()}>
        <UserGroupsPage
          selectedId="8"
          creating={false}
          onSelect={onSelect}
          onCreate={vi.fn()}
        />
      </ConsoleContext>,
    );
    fireEvent.click(await screen.findByRole("button", { name: "移除" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认移除" }));
    // 移除提交挂起：外层关闭尝试不收起任何一层
    expect(
      screen.getByRole("button", { name: "正在移除" }),
    ).toBeInTheDocument();
    const overlay = document.querySelector('[data-slot="sheet-overlay"]');
    if (overlay) fireEvent.click(overlay);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(
      screen.getByRole("button", { name: "正在移除" }),
    ).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();

    // 提交收敛后移除弹层自行关闭，外层守卫放行
    await act(async () =>
      remove.resolve(success({ groupId: "8", userId: "3", member: false })),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "正在移除" }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledWith(null));
  });
});
