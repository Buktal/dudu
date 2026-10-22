import { afterEach, describe, expect, it, vi } from "vitest";
import { ConsoleClient } from "@/api/client";
import { installHttp, success } from "@/test/http";
import { channelApi } from "./api";

afterEach(() => vi.unstubAllGlobals());
describe("渠道账号公开 API", () => {
  it("读取所有分页组候选，不截断第 100 个", async () => {
    installHttp((_url, init) => {
      const page = JSON.parse(String(init.body)).page;
      return success({
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
      });
    });
    expect(
      (
        await channelApi.groups(
          new ConsoleClient(),
          new AbortController().signal,
        )
      )[100]?.groupId,
    ).toBe("101");
  });
});

it("拒绝超过 128KiB 的配置报文，不向服务发送", async () => {
  const fetcher = installHttp(() => {
    throw new Error("不应发出请求");
  });
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
});
