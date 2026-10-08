import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { useAdminQuery } from "./admin-query";
import { AdminClient } from "./client";
import { AdminContext } from "./context";

// 领域无关的单记录夹具：结构与单记录接口对齐——client 之外只有业务参数与信号。
interface FixtureItem {
  companyId: string;
}
type FixtureLoad = (
  client: AdminClient,
  signal: AbortSignal,
) => Promise<FixtureItem>;

// client 在挂载时创建一次：wrapper 重渲染不得更换绑定，否则会重启查询。
function contextWrapper(client: AdminClient) {
  return ({ children }: { children: ReactNode }) => (
    <AdminContext value={client}>{children}</AdminContext>
  );
}

// 无业务参数的挂载方式：与调用点 useAdminQuery(adminApi.x, []) 同形。
function mount(load: FixtureLoad) {
  return renderHook(() => useAdminQuery(load, []), {
    wrapper: contextWrapper(new AdminClient()),
  });
}

it("useAdminQuery 只透传查询四键：data、error、loading、refresh", async () => {
  const load = vi.fn<FixtureLoad>(() =>
    Promise.resolve({ companyId: "123456" }),
  );
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
  const clients = [new AdminClient(), new AdminClient()];
  let current = 0;
  const load = vi.fn<FixtureLoad>((client) =>
    Promise.resolve({ companyId: `from-${clients.indexOf(client)}` }),
  );
  const { result, rerender } = renderHook(() => useAdminQuery(load, []), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <AdminContext value={clients[current]}>{children}</AdminContext>
    ),
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual({ companyId: "from-0" });

  current = 1;
  rerender();
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual({ companyId: "from-1" });
  expect(load.mock.calls.map(([client]) => client)).toEqual(clients);
});

it("deps（业务参数）变化时以新参数重发", async () => {
  const load = vi.fn(
    (_client: AdminClient, companyId: string, _signal: AbortSignal) =>
      Promise.resolve({ companyId }),
  );
  const { result, rerender } = renderHook(
    ({ companyId }: { companyId: string }) => useAdminQuery(load, [companyId]),
    {
      initialProps: { companyId: "123456" },
      wrapper: contextWrapper(new AdminClient()),
    },
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual({ companyId: "123456" });

  rerender({ companyId: "654321" });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual({ companyId: "654321" });
  expect(load.mock.calls.map(([, companyId]) => companyId)).toEqual([
    "123456",
    "654321",
  ]);
});

it("deps 与 client 均不变时不重发：load 身份稳定", async () => {
  const load = vi.fn<FixtureLoad>(() =>
    Promise.resolve({ companyId: "123456" }),
  );
  const { result, rerender } = mount(load);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual({ companyId: "123456" });

  rerender();
  rerender();
  await act(async () => {});
  expect(load).toHaveBeenCalledTimes(1);
  expect(result.current.data).toEqual({ companyId: "123456" });
});

it("失败时 error 透出，失败不冒充空数据", async () => {
  const load = vi.fn<FixtureLoad>(() =>
    Promise.reject(new Error("企业不存在")),
  );
  const { result } = mount(load);
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe("企业不存在");
  expect(result.current.data).toBeNull();
});
