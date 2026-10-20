import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import App from "./App";

beforeEach(() => {
  sessionStorage.clear();
  window.location.hash = "/login";
  vi.restoreAllMocks();
});
it("企业登录失败保留输入，成功按权限进入用户组", async () => {
  const profile = {
    company: { companyId: "100001", companyName: "测试企业" },
    user: {
      userId: "1",
      username: "manager",
      name: "管理员",
      role: "console",
      isInitialAdmin: false,
    },
    managedGroupIds: [],
  };
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: 10104, msg: "登录名或密码错误", data: null }),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 0,
          msg: "成功",
          data: { token: "token", expiresAt: 1900000000, profile },
        }),
      ),
    );
  render(<App />);
  fireEvent.change(screen.getByLabelText("企业 ID"), {
    target: { value: "100001" },
  });
  fireEvent.change(screen.getByLabelText("登录名"), {
    target: { value: "manager" },
  });
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: " password " },
  });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
  expect(await screen.findByText("登录名或密码错误")).toBeInTheDocument();
  expect(screen.getByLabelText("密码")).toHaveValue(" password ");
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
  await waitFor(() => expect(window.location.hash).toBe("#/user-groups"));
  expect(screen.queryByRole("link", { name: "员工" })).not.toBeInTheDocument();
});
