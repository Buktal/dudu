import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { success } from "@/test/http";
import { ApiError, ConsoleClient, ENTITY_MISSING } from "./client";
import { useConsoleQuery } from "./console-query";
import { ConsoleContext } from "./context";
import { useEntityGuard } from "./entity-guard";

afterEach(() => {
  vi.unstubAllGlobals();
});

// 领域无关的实体夹具：与详情读取接口对齐——client、业务 id 与信号。
interface FixtureItem {
  groupId: string;
}
type FixtureLoad = (
  client: ConsoleClient,
  id: string,
  signal: AbortSignal,
) => Promise<FixtureItem>;

const missing = () => new ApiError("对象不可见", ENTITY_MISSING);
const swallow = (pending: Promise<unknown>) =>
  act(async () => {
    await pending.catch(() => {});
  });

it("onMissing 经 ref 读最新闭包：重渲染后触发的是新回调", async () => {
  const load = vi.fn<FixtureLoad>(() => Promise.reject(missing()));
  const stale = vi.fn();
  const latest = vi.fn();
  const { result, rerender } = renderHook(
    ({ onMissing }: { onMissing: () => void }) =>
      useEntityGuard(load, onMissing),
    { initialProps: { onMissing: stale } },
  );
  rerender({ onMissing: latest });
  await swallow(
    result.current(new ConsoleClient(), "8", new AbortController().signal),
  );
  expect(stale).not.toHaveBeenCalled();
  expect(latest).toHaveBeenCalledTimes(1);
});

it("包装函数身份稳定：onMissing 变化不换身份，load 变化才换", () => {
  const load = vi.fn<FixtureLoad>(() => Promise.resolve({ groupId: "8" }));
  const { result, rerender } = renderHook(
    ({ onMissing, source }: { onMissing: () => void; source: FixtureLoad }) =>
      useEntityGuard(source, onMissing),
    { initialProps: { onMissing: vi.fn(), source: load } },
  );
  const wrapped = result.current;
  rerender({ onMissing: vi.fn(), source: load });
  expect(result.current).toBe(wrapped);
  // deps 只含 load：load 换身份才换包装，重查由 use-query 的 load 依赖驱动
  const nextLoad = vi.fn<FixtureLoad>(() => Promise.resolve({ groupId: "8" }));
  rerender({ onMissing: vi.fn(), source: nextLoad });
  expect(result.current).not.toBe(wrapped);
});

it("作为查询的 load：onMissing 变化不重启查询", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => success(null)),
  );
  const client = new ConsoleClient();
  const load = vi.fn<FixtureLoad>(() => Promise.resolve({ groupId: "8" }));
  // 与调用点 useConsoleQuery(useEntityGuard(api.detail, close), [id]) 同形
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ConsoleContext value={client}>{children}</ConsoleContext>
  );
  const { result, rerender } = renderHook(
    ({ onMissing }: { onMissing: () => void }) =>
      useConsoleQuery(useEntityGuard(load, onMissing), ["8"]),
    { initialProps: { onMissing: vi.fn() }, wrapper },
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(load).toHaveBeenCalledTimes(1);
  rerender({ onMissing: vi.fn() });
  await act(async () => {});
  expect(load).toHaveBeenCalledTimes(1);
  expect(result.current.data).toEqual({ groupId: "8" });
});

it("signal 未中止才收起：已中止的实体缺失不误触发回调", async () => {
  const load = vi.fn<FixtureLoad>(() => Promise.reject(missing()));
  const onMissing = vi.fn();
  const { result } = renderHook(() => useEntityGuard(load, onMissing));
  const aborted = new AbortController();
  aborted.abort();
  await swallow(result.current(new ConsoleClient(), "8", aborted.signal));
  expect(onMissing).not.toHaveBeenCalled();

  await swallow(
    result.current(new ConsoleClient(), "8", new AbortController().signal),
  );
  expect(onMissing).toHaveBeenCalledTimes(1);
});
