import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useMutation } from "./use-mutation";

it("成功提交把结果交给 commit 写回，并结束 pending", async () => {
  const commit = vi.fn();
  const { result } = renderHook(() => useMutation());
  await act(async () => {
    await result.current.run(async () => "结果", { commit });
  });
  expect(commit).toHaveBeenCalledWith("结果");
  expect(result.current.pending).toBe(false);
  expect(result.current.error).toBeNull();
});

it("提交失败写入 error 并回调 onError，不执行写回", async () => {
  const commit = vi.fn();
  const onError = vi.fn();
  const { result } = renderHook(() => useMutation());
  await act(async () => {
    await result.current.run(
      async () => {
        throw new Error("服务繁忙");
      },
      { commit, onError },
    );
  });
  expect(result.current.error).toBe("服务繁忙");
  expect(onError).toHaveBeenCalledTimes(1);
  expect(commit).not.toHaveBeenCalled();
  expect(result.current.pending).toBe(false);
});

it("取消异常按取消处理，不报 error 也不写回", async () => {
  const commit = vi.fn();
  const onError = vi.fn();
  const { result } = renderHook(() => useMutation());
  await act(async () => {
    await result.current.run(
      async () => {
        throw new DOMException("请求已取消", "AbortError");
      },
      { commit, onError },
    );
  });
  expect(result.current.error).toBeNull();
  expect(onError).not.toHaveBeenCalled();
  expect(commit).not.toHaveBeenCalled();
  expect(result.current.pending).toBe(false);
});

it("中止后 resolve 不触发写回，也不误报错误", async () => {
  let resolve!: (value: string) => void;
  const commit = vi.fn();
  const onError = vi.fn();
  const { result } = renderHook(() => useMutation());
  let done!: Promise<void>;
  await act(async () => {
    done = result.current.run(
      () =>
        new Promise<string>((step) => {
          resolve = step;
        }),
      { commit, onError },
    );
  });
  expect(result.current.pending).toBe(true);
  act(() => result.current.abort());
  expect(result.current.pending).toBe(false);
  await act(async () => {
    resolve("迟到结果");
    await done;
  });
  expect(commit).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
  expect(result.current.error).toBeNull();
});

it("提交进行中拒绝重复提交，撤销后可重新提交", async () => {
  const first = vi.fn(() => new Promise<string>(() => {}));
  const retry = vi.fn(async () => "重试结果");
  const commit = vi.fn();
  const { result } = renderHook(() => useMutation());
  await act(async () => {
    void result.current.run(first, { commit });
  });
  await act(async () => {
    void result.current.run(retry, { commit });
  });
  expect(retry).not.toHaveBeenCalled();
  act(() => result.current.abort());
  await act(async () => {
    await result.current.run(retry, { commit });
  });
  expect(retry).toHaveBeenCalledTimes(1);
  expect(commit).toHaveBeenCalledWith("重试结果");
});
