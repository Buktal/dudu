import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  failure,
  installHttp,
  loginResult,
  profile,
  success,
} from "@/test/http";
import App from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  sessionStorage.clear();
  window.location.hash = "/login";
  vi.restoreAllMocks();
});
it("企业登录失败保留输入，成功按权限进入用户组", async () => {
  // 受限身份：非初始管理员，员工入口不出现
  const restricted = {
    ...loginResult,
    profile: {
      ...profile,
      company: { companyId: "100001", companyName: "测试企业" },
      user: {
        ...profile.user,
        userId: "1",
        name: "管理员",
        isInitialAdmin: false,
      },
    },
  };
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(failure(10104, "登录名或密码错误"))
    .mockResolvedValueOnce(success(restricted));
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

it("初始管理员登录后进入真实员工管理页面", async () => {
  installHttp(() => success({ list: [], total: 0, page: 1, pageSize: 20 }));
  render(<App />);
  fireEvent.change(screen.getByLabelText("企业 ID"), {
    target: { value: "100001" },
  });
  fireEvent.change(screen.getByLabelText("登录名"), {
    target: { value: "admin" },
  });
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: "fixture-only" },
  });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
  expect(
    await screen.findByRole("button", { name: "创建员工" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("正在准备管理页面。")).not.toBeInTheDocument();
});
