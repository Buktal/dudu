import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { profile, success } from "@/test/http";
import { ConsoleClient, isEmpty } from "./client";
import { useConsoleQuery } from "./console-query";
import { ConsoleContext } from "./context";

afterEach(() => {
  vi.unstubAllGlobals();
});

// 领域无关的单记录夹具：结构与单记录接口对齐——client 之外只有业务参数与信号。
interface FixtureItem {
  accountId: string;
}
type FixtureLoad = (
  client: ConsoleClient,
  signal: AbortSignal,
) => Promise<FixtureItem>;

// client 在挂载时创建一次：wrapper 重渲染不得更换绑定，否则会重启查询。
function contextWrapper(client: ConsoleClient) {
  return ({ children }: { children: ReactNode }) => (
    <ConsoleContext value={client}>{children}</ConsoleContext>
  );
}

// 无业务参数的挂载方式：与调用点 useConsoleQuery(consoleApi.x, []) 同形。
function mount(load: FixtureLoad) {
  return renderHook(() => useConsoleQuery(load, []), {
    wrapper: contextWrapper(new ConsoleClient()),
  });
}

it("useConsoleQuery 只透传查询四键：data、error、loading、refresh", async () => {
  const load = vi.fn<FixtureLoad>(() => Promise.resolve({ accountId: "3" }));
  const { result } = mount(load);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(Object.keys(result.current).sort()).toEqual([
    "data",
    "error",
    "loading",
    "refresh",
  ]);
});

it("client 变化时以新 client 重新绑定并重发请求", async () => {
  const clients = [new ConsoleClient(), new ConsoleClient()];
  let current = 0;
  const load = vi.fn<FixtureLoad>((client) =>
    Promise.resolve({ accountId: `from-${clients.indexOf(client)}` }),
  );
  const { result, rerender } = renderHook(() => useConsoleQuery(load, []), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <ConsoleContext value={clients[current]}>{children}</ConsoleContext>
    ),
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual({ accountId: "from-0" });

  current = 1;
  rerender();
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual({ accountId: "from-1" });
  expect(load.mock.calls.map(([client]) => client)).toEqual(clients);
});

it("deps（业务参数）变化时以新参数重发", async () => {
  const load = vi.fn(
    (_client: ConsoleClient, accountId: string, _signal: AbortSignal) =>
      Promise.resolve({ accountId }),
  );
  const { result, rerender } = renderHook(
    ({ accountId }: { accountId: string }) =>
      useConsoleQuery(load, [accountId]),
    {
      initialProps: { accountId: "3" },
      wrapper: contextWrapper(new ConsoleClient()),
    },
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual({ accountId: "3" });

  rerender({ accountId: "8" });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual({ accountId: "8" });
  expect(load.mock.calls.map(([, accountId]) => accountId)).toEqual(["3", "8"]);
});

it("deps 与 client 均不变时不重发：load 身份稳定", async () => {
  const load = vi.fn<FixtureLoad>(() => Promise.resolve({ accountId: "3" }));
  const { result, rerender } = mount(load);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual({ accountId: "3" });

  rerender();
  rerender();
  await act(async () => {});
  expect(load).toHaveBeenCalledTimes(1);
  expect(result.current.data).toEqual({ accountId: "3" });
});

it("失败时 error 透出，失败不冒充空数据", async () => {
  const load = vi.fn<FixtureLoad>(() =>
    Promise.reject(new Error("账号不存在")),
  );
  const { result } = mount(load);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe("账号不存在");
  expect(result.current.data).toBeNull();
});

it("accessRevision / dataRevision 进入重查依赖：权限刷新后重发请求", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => success(profile)),
  );
  const client = new ConsoleClient();
  const load = vi.fn<FixtureLoad>(() => Promise.resolve({ accountId: "3" }));
  const { result } = renderHook(() => useConsoleQuery(load, []), {
    wrapper: contextWrapper(client),
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(load).toHaveBeenCalledTimes(1);

  // refreshProfile(true) 无条件推进 accessRevision：权限刷新必触发重查
  await act(async () => {
    await client.refreshProfile(true);
  });
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  expect(result.current.data).toEqual({ accountId: "3" });
});

it("写成功失效后重查：dataRevision 进入重查依赖", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => success(null)),
  );
  const client = new ConsoleClient();
  const load = vi.fn<FixtureLoad>(() => Promise.resolve({ accountId: "3" }));
  const { result } = renderHook(() => useConsoleQuery(load, []), {
    wrapper: contextWrapper(client),
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(load).toHaveBeenCalledTimes(1);

  // 写成功即失效（宏任务一拍）：非 stable 查询随失效陪跑重查
  await act(async () => {
    await client.request("/console/employees/2", {
      method: "PUT",
      write: true,
      validate: isEmpty,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  expect(result.current.data).toEqual({ accountId: "3" });
});

it("stable 目录查询跳过写后失效：失效已发布但不重查", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => success(null)),
  );
  const client = new ConsoleClient();
  const load = vi.fn<FixtureLoad>(() => Promise.resolve({ accountId: "3" }));
  const { result } = renderHook(
    () => useConsoleQuery(load, [], { stable: true }),
    {
      wrapper: contextWrapper(client),
    },
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(load).toHaveBeenCalledTimes(1);

  // 写成功失效仍照常发布，stable 查询不陪跑重查
  await act(async () => {
    await client.request("/console/employees/2", {
      method: "PUT",
      write: true,
      validate: isEmpty,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(client.getSnapshot().dataRevision).toBe(1);
  expect(load).toHaveBeenCalledTimes(1);
  expect(result.current.data).toEqual({ accountId: "3" });
});
