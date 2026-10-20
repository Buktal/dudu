import { beforeEach, expect, it, vi } from "vitest";
import { ApiError, ConsoleClient, isEmpty } from "./client";

const profile = {
  company: { companyId: "100001", companyName: "测试企业" },
  user: {
    userId: "1",
    username: "owner",
    name: "管理员",
    role: "console",
    isInitialAdmin: true,
  },
  managedGroupIds: [],
};
const reply = (data: unknown, code = 0) =>
  new Response(JSON.stringify({ code, msg: code ? "没有权限" : "成功", data }));
beforeEach(() => {
  sessionStorage.clear();
  vi.restoreAllMocks();
});
it("登录传递企业身份、保留密码并使用独立会话", async () => {
  const fetcher = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      reply({ token: "token", expiresAt: 1900000000, profile }),
    );
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
    .mockResolvedValueOnce(
      reply({ token: "token", expiresAt: 1900000000, profile }),
    )
    .mockResolvedValueOnce(reply(null, 10106))
    .mockResolvedValueOnce(reply(profile));
  const client = new ConsoleClient();
  await client.login("100001", "owner", "secret");
  await expect(
    client.request("/console/employees", { validate: isEmpty }),
  ).rejects.toBeInstanceOf(ApiError);
  expect(client.getSnapshot().profile).toEqual(profile);
});
it("拒绝错误身份和非字符串ID", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    reply({
      token: "token",
      expiresAt: 1900000000,
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
    .mockResolvedValueOnce(reply(profile))
    .mockResolvedValueOnce(reply(null, 10106));
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
  resolve(reply({ token: "late", expiresAt: 1900000000, profile }));
  await expect(request).rejects.toMatchObject({ name: "AbortError" });
  expect(client.getSnapshot().profile).toBeNull();
});
