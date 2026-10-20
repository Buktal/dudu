import { useCallback, useEffect, useState } from "react";
import { errorMessage, isCancelled } from "./client";

// useQuery 的 interface 恒定四键：{data, error, loading, refresh}。
// 「失败不冒充空数据」「旧请求取消、迟到结果丢弃」都在这里单点实现。
// load 身份与 attempt 计数只是 implementation：两者推进后、effect 写入新结果前的
// 一次渲染回落到加载中快照，保证旧数据不以新查询的名义出现。
export function useQuery<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    load: typeof load;
    attempt: number;
    data: T | null;
    error: string | null;
    loading: boolean;
  }>({ load, attempt, data: null, error: null, loading: true });
  useEffect(() => {
    const controller = new AbortController();
    setResult({ load, attempt, data: null, error: null, loading: true });
    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted)
          setResult({ load, attempt, data, error: null, loading: false });
      },
      (error) => {
        if (!controller.signal.aborted && !isCancelled(error))
          setResult({
            load,
            attempt,
            data: null,
            error: errorMessage(error),
            loading: false,
          });
      },
    );
    return () => controller.abort();
  }, [load, attempt]);
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  const current =
    result.load === load && result.attempt === attempt
      ? result
      : { data: null, error: null, loading: true };
  return {
    data: current.data,
    error: current.error,
    loading: current.loading,
    refresh,
  };
}
