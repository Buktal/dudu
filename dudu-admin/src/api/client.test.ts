import { beforeEach, expect, it, vi } from "vitest";
import { account, failure, success } from "@/test/http";
import { AdminClient, isEmpty } from "./client";

// 登录契约夹具：与 admin 登录响应同形（token + exp + 平台管理员身份）
const loginResult = { token: "test-token", exp: 2000000000, user: account };

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});
it("登录传递平台身份、保留密码并使用独立会话", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(success(loginResult));
  const client = new AdminClient();
  await client.login("admin", " pass ");
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
    username: "admin",
    password: " pass ",
  });
  expect(client.getSnapshot().user).toEqual(account);
  expect(sessionStorage.getItem("dudu-admin.session")).toContain("token");
});
it("无权限错误码清理会话，不循环刷新身份", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(success(loginResult))
    .mockImplementation(async () => failure(10106, "没有权限"));
  const client = new AdminClient();
  await client.login("admin", "secret");
  // 清理会话会中止在途请求：调用方收到取消信号而非业务错误，身份已一并清理
  await expect(
    client.request("/admin/companies/123456", {
      method: "PUT",
      write: true,
      validate: isEmpty,
    }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(client.getSnapshot().user).toBeNull();
  expect(sessionStorage.getItem("dudu-admin.session")).toBeNull();
});
it("业务失败保留身份且不触发失效，读取失败不会循环", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(success(loginResult))
    .mockImplementation(async () => failure(12100, "企业不存在"));
  const client = new AdminClient();
  await client.login("admin", "secret");
  await expect(
    client.request("/admin/companies/123456", {
      method: "PUT",
      write: true,
      validate: isEmpty,
    }),
  ).rejects.toMatchObject({ code: 12100 });
  expect(client.getSnapshot().user).toEqual(account);
  expect(client.getSnapshot().dataRevision).toBe(0);
  await expect(
    client.request("/admin/companies/123456", { validate: isEmpty }),
  ).rejects.toMatchObject({ code: 12100 });
  expect(client.getSnapshot().user).toEqual(account);
});
it("写成功失效数据一次，读取与查询不触发失效", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(success(loginResult))
    .mockImplementation(async () => success(null));
  const client = new AdminClient();
  await client.login("admin", "secret");
  // 登录是会话建立而非数据写入，不触发失效
  expect(client.getSnapshot().dataRevision).toBe(0);
  await client.request("/admin/companies/123456", {
    method: "PUT",
    write: true,
    validate: isEmpty,
  });
  await vi.waitFor(() => expect(client.getSnapshot().dataRevision).toBe(1));
  await client.request("/admin/companies", { validate: isEmpty });
  await client.request("/admin/companies/query", {
    method: "POST",
    validate: isEmpty,
  });
  expect(client.getSnapshot().dataRevision).toBe(1);
});
it("拒绝错误身份和非字符串ID", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    success({
      ...loginResult,
      user: { ...account, userId: 1 },
    }),
  );
  const client = new AdminClient();
  await expect(client.login("admin", "secret")).rejects.toThrow("服务响应异常");
  expect(client.getSnapshot().user).toBeNull();
});
it("恢复会话从服务端读取身份，身份失效后清理会话", async () => {
  sessionStorage.setItem(
    "dudu-admin.session",
    JSON.stringify({ origin: "", token: "old-token" }),
  );
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(success(account))
    .mockImplementation(async () => failure(10106, "没有权限"));
  const client = new AdminClient();
  expect(client.getSnapshot().restoring).toBe(true);
  await client.restore(new AbortController().signal);
  expect(client.getSnapshot().user).toEqual(account);
  // 同一份存储令牌再次恢复：身份已失效则清理会话
  const expired = new AdminClient();
  await expired.restore(new AbortController().signal);
  expect(expired.getSnapshot().user).toBeNull();
  expect(sessionStorage.getItem("dudu-admin.session")).toBeNull();
});
it("退出会话丢弃在途响应，无法再次写入旧身份", async () => {
  let resolve!: (value: Response) => void;
  vi.spyOn(globalThis, "fetch").mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const client = new AdminClient();
  const request = client.login("admin", "secret");
  client.clearSession();
  resolve(success(loginResult));
  await expect(request).rejects.toMatchObject({ name: "AbortError" });
  expect(client.getSnapshot().user).toBeNull();
});
