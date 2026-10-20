import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleClient } from "@/api/client";
import { groupsApi } from "./groups-api";

afterEach(() => vi.restoreAllMocks());
describe("用户组公开 API", () => {
  it("只添加目标组成员，不覆盖员工其他组", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          msg: "ok",
          data: { groupId: "8", userId: "20", member: true },
        }),
      ),
    );
    await groupsApi.add(new ConsoleClient(), "8", "20");
    expect(fetcher.mock.calls[0][0]).toBe(
      "/api/console/user_groups/8/members/20",
    );
    expect(fetcher.mock.calls[0][1]?.method).toBe("PUT");
    expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
  });
  it("候选目录保留服务端分页，不截断为全量员工", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          msg: "ok",
          list: [
            { userId: "20", username: "test", name: "测试", role: "user" },
          ],
          total: 45,
          page: 2,
          pageSize: 20,
        }),
      ),
    );
    const result = await groupsApi.candidates(
      new ConsoleClient(),
      "8",
      { keyword: "测试", page: 2, pageSize: 20 },
      new AbortController().signal,
    );
    expect(result.total).toBe(45);
    expect(result.page).toBe(2);
    expect(String(fetcher.mock.calls[0][0])).toContain("page=2");
  });
  it("拒绝不属于目标组的成员写入响应", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 0,
          msg: "ok",
          data: { groupId: "9", userId: "20", member: true },
        }),
      ),
    );
    await expect(groupsApi.add(new ConsoleClient(), "8", "20")).rejects.toThrow(
      "服务响应异常",
    );
  });
});
it("拒绝详情响应中的其他用户组", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        code: 0,
        msg: "ok",
        data: {
          groupId: "9",
          groupName: "另一组",
          memberCount: 0,
          channelAccountCount: 0,
          createTime: "2026-10-20 10:00:00",
          updateTime: "2026-10-20 10:00:00",
        },
      }),
    ),
  );
  await expect(groupsApi.detail(new ConsoleClient(), "8")).rejects.toThrow(
    "服务响应异常",
  );
});
