import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "@/App";
import { failure } from "@/test/http";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("生产构建忽略开发存储和 URL 覆盖，只向发布地址登录", async () => {
  vi.stubEnv("DEV", false);
  vi.stubEnv("VITE_API_ORIGIN", "https://admin-api.example.org");
  localStorage.setItem(
    "dudu-admin.environment",
    JSON.stringify({
      environment: "local",
      localOrigin: "http://192.168.1.25:8080",
    }),
  );
  window.history.replaceState(null, "", "/?api=http://192.168.1.66:9000");
  const request = vi.fn().mockResolvedValue(failure(10104, "账号或密码错误"));
  vi.stubGlobal("fetch", request);
  render(<App />);
  expect(
    screen.queryByRole("button", { name: "选择环境" }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("登录名")).toHaveValue("");
  expect(screen.getByLabelText("密码")).toHaveValue("");
  fireEvent.change(screen.getByLabelText("登录名"), {
    target: { value: "operator" },
  });
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: "password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
  await screen.findByRole("alert");
  expect(request.mock.calls[0][0]).toBe(
    "https://admin-api.example.org/api/admin/auth/login",
  );
});

it("可以从下拉菜单修改本地 IP，拒绝带凭据和路径的地址", async () => {
  const request = vi.fn().mockResolvedValue(failure(10104, "账号或密码错误"));
  vi.stubGlobal("fetch", request);
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "选择环境" }));
  fireEvent.click(
    await screen.findByRole("menuitem", { name: "修改本地地址" }),
  );
  fireEvent.change(screen.getByLabelText("服务地址"), {
    target: { value: "https://user:pass@host.test/api" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存并切换" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "仅包含主机和端口",
  );
  fireEvent.change(screen.getByLabelText("服务地址"), {
    target: { value: "http://192.168.1.25:9080/" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存并切换" }));
  fireEvent.change(screen.getByLabelText("登录名"), {
    target: { value: "operator" },
  });
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: "password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
  await screen.findByRole("alert");
  expect(request.mock.calls[0][0]).toBe(
    "http://192.168.1.25:9080/api/admin/auth/login",
  );
});
