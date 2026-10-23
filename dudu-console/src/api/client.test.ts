import { beforeEach, expect, it, vi } from "vitest";
import { failure, loginResult, profile, success } from "@/test/http";
import { ApiError, ConsoleClient, isEmpty } from "./client";

beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});
it("登录传递企业身份、保留密码并使用独立会话", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(success(loginResult));
  const client = new ConsoleClient();
  await client.login("100001", "owner", " pass ");
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
    companyId: "100001",
    username: "owner",
    password: " pass ",
  });
  expect(client.getSnapshot().profile).toEqual(profile);
  expect(sessionStorage.getItem("dudu-console.session")).toContain("token");
});
it("业务无权限保留身份并重取权限", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(success(loginResult))
    .mockResolvedValueOnce(failure(10106, "没有权限"))
    .mockResolvedValueOnce(success(profile));
  const client = new ConsoleClient();
  await client.login("100001", "owner", "secret");
  await expect(
    client.request("/console/employees/2/role", {
      method: "PUT",
      write: true,
      validate: isEmpty,
    }),
  ).rejects.toBeInstanceOf(ApiError);
  expect(client.getSnapshot().profile).toEqual(profile);
  await vi.waitFor(() => expect(client.getSnapshot().accessRevision).toBe(1));
});
it("不可见对象写入失败后重取当前查询，读取失败不会循环刷新", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(success(loginResult))
    .mockImplementation(async () => failure(12100, "对象不可见"));
  const client = new ConsoleClient();
  await client.login("100001", "owner", "secret");
  await expect(
    client.request("/console/employees/2", {
      method: "PUT",
      write: true,
      validate: isEmpty,
    }),
  ).rejects.toMatchObject({ code: 12100 });
  expect(client.getSnapshot().accessRevision).toBe(1);
  await expect(
    client.request("/console/employees/2", { validate: isEmpty }),
  ).rejects.toMatchObject({ code: 12100 });
  expect(client.getSnapshot().accessRevision).toBe(1);
});
it("写成功失效数据一次，读取与查询不触发失效", async () => {
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(success(loginResult))
    .mockImplementation(async () => success(null));
  const client = new ConsoleClient();
  await client.login("100001", "owner", "secret");
  // 登录是会话建立而非数据写入，不触发失效
  expect(client.getSnapshot().dataRevision).toBe(0);
  await client.request("/console/groups/2/members", {
    method: "PUT",
    write: true,
    validate: isEmpty,
  });
  await vi.waitFor(() => expect(client.getSnapshot().dataRevision).toBe(1));
  await client.request("/console/employees", { validate: isEmpty });
  await client.request("/console/groups/query", {
    method: "POST",
    validate: isEmpty,
  });
  expect(client.getSnapshot().dataRevision).toBe(1);
});
it("拒绝错误身份和非字符串ID", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    success({
      ...loginResult,
      profile: { ...profile, user: { ...profile.user, userId: 1 } },
    }),
  );
  const client = new ConsoleClient();
  await expect(client.login("100001", "owner", "secret")).rejects.toThrow(
    "服务响应异常",
  );
  expect(client.getSnapshot().profile).toBeNull();
});
it("恢复会话从服务端读取身份，身份拒绝后清理会话", async () => {
  sessionStorage.setItem(
    "dudu-console.session",
    JSON.stringify({ origin: "", token: "old-token" }),
  );
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(success(profile))
    .mockResolvedValueOnce(failure(10106, "没有权限"));
  const client = new ConsoleClient();
  expect(client.getSnapshot().restoring).toBe(true);
  await client.restore(new AbortController().signal);
  expect(client.getSnapshot().profile).toEqual(profile);
  await client.refreshProfile();
  expect(client.getSnapshot().profile).toBeNull();
  expect(sessionStorage.getItem("dudu-console.session")).toBeNull();
});
it("退出会话丢弃在途响应，无法再次写入旧身份", async () => {
  let resolve!: (value: Response) => void;
  vi.spyOn(globalThis, "fetch").mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      }),
  );
  const client = new ConsoleClient();
  const request = client.login("100001", "owner", "secret");
  client.clearSession();
  resolve(success(loginResult));
  await expect(request).rejects.toMatchObject({ name: "AbortError" });
  expect(client.getSnapshot().profile).toBeNull();
});
