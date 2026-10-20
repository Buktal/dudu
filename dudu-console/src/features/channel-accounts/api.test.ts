import { describe, expect, it, vi } from "vitest";
import { ConsoleClient } from "@/api/client";
import { channelApi } from "./api";

describe("渠道账号公开 API", () => {
  it("读取所有分页组候选，不截断第 100 个", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init) => {
        const page = JSON.parse(init.body).page;
        return new Response(
          JSON.stringify({
            code: 0,
            msg: "",
            list:
              page === 1
                ? Array.from({ length: 100 }, (_, i) => ({
                    groupId: String(i + 1),
                    groupName: `组${i + 1}`,
                  }))
                : [{ groupId: "101", groupName: "最后组" }],
            total: 101,
            page,
            pageSize: 100,
          }),
        );
      }),
    );
    expect(
      (
        await channelApi.groups(
          new ConsoleClient(),
          new AbortController().signal,
        )
      )[100]?.groupId,
    ).toBe("101");
    vi.unstubAllGlobals();
  });
});

it("拒绝超过 128KiB 的配置报文，不向服务发送", async () => {
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  await expect(
    channelApi.create(
      new ConsoleClient(),
      {
        groupId: "2",
        channel: "alipay",
        accountName: "账号",
        fields: { appPrivateKey: "密".repeat(45000) },
      },
      new AbortController().signal,
    ),
  ).rejects.toThrow("配置请求不能超过 128KiB");
  expect(fetcher).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
