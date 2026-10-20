import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConsoleClient } from "@/api/client";
import { ConsoleContext } from "@/api/context";
import { EmployeeDetail } from "./EmployeeDetail";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  sessionStorage.clear();
});
it("initial administrator details expose name editing but protect role, status and password", async () => {
  const profile = {
    company: { companyId: "100001", companyName: "企业" },
    user: {
      userId: "1",
      username: "owner",
      name: "初始管理员",
      role: "console",
      isInitialAdmin: true,
    },
    managedGroupIds: [],
  };
  const employee = {
    ...profile.user,
    status: 1,
    groupIds: [],
    createTime: "2026-10-20 10:00:00",
    updateTime: "2026-10-20 10:00:00",
  };
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 0,
          msg: "成功",
          data: { token: "test", expiresAt: 2000000000, profile },
        }),
      ),
    )
    .mockResolvedValue(
      new Response(JSON.stringify({ code: 0, msg: "成功", data: employee })),
    );
  const client = new ConsoleClient();
  await client.login("100001", "owner", "password");
  render(
    <ConsoleContext value={client}>
      <EmployeeDetail id="1" close={vi.fn()} changed={vi.fn()} />
    </ConsoleContext>,
  );
  expect(
    await screen.findByRole("button", { name: "修改显示名称" }),
  ).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: "停用员工" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "撤销管理员" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "重置密码" }),
  ).not.toBeInTheDocument();
});
