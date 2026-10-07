import { act, renderHook, waitFor } from "@testing-library/react";
import { useCallback, useState } from "react";
import { expect, it } from "vitest";
import { useQuery } from "./use-query";

// 受闸门控制的加载函数：请求停在未决，由测试放行 resolve，用于编排竞态时序。
const gatedLoad = (gates: ((value: number) => void)[]) => () =>
  new Promise<number>((step) => gates.push(step));

type FailMode = "message" | "raw" | "cancelled";

it("useQuery 只返回恒定四键：data、error、loading、refresh", () => {
  const gates: ((value: number) => void)[] = [];
  const load = gatedLoad(gates);
  const { result } = renderHook(() => useQuery(load));
  expect(Object.keys(result.current).sort()).toEqual([
    "data",
    "error",
    "loading",
    "refresh",
  ]);
});

it("refresh 清空数据回到加载中，再写入新一轮结果", async () => {
  const gates: ((value: number) => void)[] = [];
  const { result } = renderHook(() => {
    const [round, setRound] = useState(0);
    const load = useCallback(
      () => gatedLoad(gates)().then((value) => value + round),
      [round],
    );
    return { query: useQuery(load), setRound };
  });

  await act(async () => gates[0](10));
  expect(result.current.query.data).toBe(10);
  expect(result.current.query.error).toBeNull();
  expect(result.current.query.loading).toBe(false);

  act(() => result.current.query.refresh());
  expect(result.current.query.data).toBeNull();
  expect(result.current.query.error).toBeNull();
  expect(result.current.query.loading).toBe(true);

  await act(async () => gates[1](20));
  expect(result.current.query.data).toBe(20);
  expect(result.current.query.loading).toBe(false);
});

it("load 变更取消旧请求，新请求独立进行", async () => {
  const signals: AbortSignal[] = [];
  const rounds: number[] = [];
  const { result } = renderHook(() => {
    const [round, setRound] = useState(0);
    const load = useCallback(
      (signal: AbortSignal) => {
        rounds.push(round);
        signals.push(signal);
        return new Promise<number>(() => {});
      },
      [round],
    );
    return { query: useQuery(load), setRound };
  });
  expect(rounds).toEqual([0]);

  act(() => result.current.setRound(1));
  await waitFor(() => expect(signals[0].aborted).toBe(true));
  expect(rounds).toEqual([0, 1]);
  expect(signals[1].aborted).toBe(false);
});

it("刷新后旧请求的迟到 resolve 被丢弃，不冒充新结果", async () => {
  const gates: ((value: number) => void)[] = [];
  const load = gatedLoad(gates);
  const { result } = renderHook(() => useQuery(load));

  act(() => result.current.refresh());
  await waitFor(() => expect(gates.length).toBe(2));

  await act(async () => gates[0](99));
  expect(result.current.data).toBeNull();
  expect(result.current.loading).toBe(true);

  await act(async () => gates[1](7));
  expect(result.current.data).toBe(7);
  expect(result.current.loading).toBe(false);
});

it("错误消息映射：Error 取 message，非 Error 回退通用文案，取消不算失败", async () => {
  const { result, rerender } = renderHook(
    ({ mode }: { mode: FailMode }) => {
      const load = useCallback((): Promise<number> => {
        if (mode === "message") return Promise.reject(new Error("企业不存在"));
        if (mode === "raw") return Promise.reject("原始失败");
        return Promise.reject(new DOMException("请求已取消", "AbortError"));
      }, [mode]);
      return useQuery(load);
    },
    { initialProps: { mode: "message" as FailMode } },
  );

  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe("企业不存在");
  expect(result.current.data).toBeNull();

  rerender({ mode: "raw" });
  await waitFor(() => expect(result.current.error).toBe("请求失败，请重试"));
  expect(result.current.loading).toBe(false);

  rerender({ mode: "cancelled" });
  await act(async () => {});
  expect(result.current.loading).toBe(true);
  expect(result.current.error).toBeNull();
});
