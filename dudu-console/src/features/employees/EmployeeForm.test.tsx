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
import { failure, installHttp, success } from "@/test/http";
import { EmployeeForm } from "./EmployeeForm";

const employee = {
  userId: "12",
  username: "alice",
  name: "Alice",
  role: "user" as const,
  status: 1 as const,
  isInitialAdmin: false,
  groupIds: [],
  createTime: "2026-10-20 10:00:00",
  updateTime: "2026-10-20 10:00:00",
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("failed creation preserves draft and retries the exact public request", async () => {
  const calls: RequestInit[] = [];
  installHttp((_url, init) => {
    calls.push(init);
    return calls.length === 1
      ? failure(12300, "登录名已存在")
      : success(employee);
  });
  const saved = vi.fn();
  const close = vi.fn();
  render(
    <ConsoleContext value={new ConsoleClient()}>
      <EmployeeForm close={close} saved={saved} />
    </ConsoleContext>,
  );
  fireEvent.change(screen.getByLabelText("登录名"), {
    target: { value: " alice " },
  });
  fireEvent.change(screen.getByLabelText("显示名称"), {
    target: { value: " Alice " },
  });
  fireEvent.change(screen.getByLabelText("初始密码"), {
    target: { value: " pass1234 " },
  });
  fireEvent.click(screen.getByRole("button", { name: "创建员工" }));
  await screen.findByText("登录名已存在");
  expect(screen.getByLabelText("初始密码")).toHaveValue(" pass1234 ");
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "创建员工" }));
  await waitFor(() =>
    expect(saved).toHaveBeenCalledWith(employee, "创建员工成功"),
  );
  expect(JSON.parse(String(calls[1]?.body))).toEqual({
    username: "alice",
    name: "Alice",
    password: " pass1234 ",
  });
  expect(screen.getByLabelText("初始密码")).toHaveValue("");
});
