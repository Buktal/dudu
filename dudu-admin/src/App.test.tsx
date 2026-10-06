import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import App from "./App";
import {
  account,
  authenticatedSession,
  company,
  deferred,
  failure,
  installHttp,
  page,
  success,
} from "./test/http";

afterEach(() => vi.unstubAllGlobals());

it("通过真实 HTTP 登录，业务认证失败时保留登录表单", async () => {
  const fetchRequest = vi
    .fn()
    .mockResolvedValue(
      Response.json({ code: 10104, msg: "账号或密码错误", data: null }),
    );
  vi.stubGlobal("fetch", fetchRequest);
  render(<App />);
  fireEvent.change(screen.getByLabelText("登录名"), {
    target: { value: "operator" },
  });
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: "wrong-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("账号或密码错误");
  expect(fetchRequest.mock.calls[0][0]).toBe(
    "http://127.0.0.1:8080/api/admin/login",
  );
  expect(JSON.parse(fetchRequest.mock.calls[0][1].body)).toEqual({
    username: "operator",
    password: "wrong-password",
  });
  expect(screen.getByRole("button", { name: "登录" })).toBeEnabled();
});

it.each([
  [
    "网络失败",
    () => Promise.reject(new TypeError("Failed to fetch")),
    "无法连接服务",
  ],
  [
    "网关失败",
    () => Promise.resolve(new Response("unavailable", { status: 503 })),
    "服务暂时不可用",
  ],
  [
    "非法响应",
    () => Promise.resolve(new Response("<html>proxy error</html>")),
    "服务响应异常",
  ],
  [
    "企业身份",
    () =>
      Promise.resolve(
        success({
          token: "other",
          exp: 2000000000,
          user: { ...account, role: "company_admin" },
        }),
      ),
    "服务响应异常",
  ],
] as const)("登录的%s不会变成成功", async (_name, respond, message) => {
  vi.stubGlobal("fetch", vi.fn(respond));
  render(<App />);
  fireEvent.change(screen.getByLabelText("登录名"), {
    target: { value: "operator" },
  });
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: "password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(
    screen.getByRole("heading", { name: "登录管理后台" }),
  ).toBeInTheDocument();
});

it("HTTP 200 中的过期业务码清除身份与企业数据", async () => {
  let expired = false;
  installHttp(() =>
    expired ? failure(10103, "Token已过期") : success(page()),
  );
  authenticatedSession();
  render(<App />);
  expect(
    await screen.findByRole("button", { name: company.companyName }),
  ).toBeInTheDocument();
  expired = true;
  fireEvent.click(screen.getByRole("button", { name: "刷新" }));
  expect(
    await screen.findByRole("heading", { name: "登录管理后台" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("登录已失效");
  expect(screen.queryByText(company.companyName)).not.toBeInTheDocument();
  expect(sessionStorage.getItem("dudu-admin.session")).toBeNull();
});

it("切换环境取消在途请求，旧令牌与迟到响应均不能进入新环境", async () => {
  const pending = deferred<Response>();
  const fetchRequest = installHttp(() => pending.promise);
  authenticatedSession();
  render(<App />);
  await screen.findByRole("heading", { name: "企业管理" });
  await waitFor(() =>
    expect(
      fetchRequest.mock.calls.some(([url]) =>
        String(url).includes("/companies?"),
      ),
    ).toBe(true),
  );
  const previousSignal = fetchRequest.mock.calls.find(([url]) =>
    String(url).includes("/companies?"),
  )?.[1].signal;
  fireEvent.click(screen.getByRole("button", { name: "选择环境" }));
  fireEvent.click(await screen.findByRole("menuitem", { name: /线上环境/ }));
  expect(
    await screen.findByRole("heading", { name: "登录管理后台" }),
  ).toBeInTheDocument();
  expect(previousSignal?.aborted).toBe(true);
  await act(async () => pending.resolve(success(page())));
  expect(screen.queryByText(company.companyName)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("登录名"), {
    target: { value: "operator" },
  });
  fireEvent.change(screen.getByLabelText("密码"), {
    target: { value: "new-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "登录" }));
  await screen.findByRole("heading", { name: "企业管理" });
  const login = fetchRequest.mock.calls.find(([url]) =>
    String(url).endsWith("/login"),
  );
  expect(String(login?.[0])).toBe("https://api.dudu.example/api/admin/login");
  expect(new Headers(login?.[1].headers).has("Authorization")).toBe(false);
});

it("退出失败也清除本机身份，并显示真实结果", async () => {
  installHttp((url) =>
    url.pathname.endsWith("/logout")
      ? new Response("", { status: 503 })
      : success(page()),
  );
  authenticatedSession();
  render(<App />);
  await screen.findByRole("heading", { name: "企业管理" });
  fireEvent.click(screen.getByRole("button", { name: "退出" }));
  expect(
    await screen.findByRole("heading", { name: "登录管理后台" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("服务未确认退出");
  expect(sessionStorage.getItem("dudu-admin.session")).toBeNull();
});
