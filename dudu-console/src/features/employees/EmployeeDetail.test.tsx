import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ConsoleClient } from "@/api/client";
import { ConsoleContext } from "@/api/context";
import { installHttp, profile, success } from "@/test/http";
import { EmployeeDetail } from "./EmployeeDetail";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});
it("initial administrator details expose name editing but protect role, status and password", async () => {
  installHttp(() =>
    success({
      ...profile.user,
      status: 1,
      groupIds: [],
      createTime: "2026-10-20 10:00:00",
      updateTime: "2026-10-20 10:00:00",
    }),
  );
  const client = new ConsoleClient();
  await client.login("100001", "owner", "password");
  render(
    <ConsoleContext value={client}>
      <EmployeeDetail id="1" close={vi.fn()} notify={vi.fn()} />
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
