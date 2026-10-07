import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, isCancelled } from "./client";

export function useMutation() {
  const active = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 撤销在途提交并放行下一次提交；卸载清理走同一条路。
  const abort = useCallback(() => {
    const controller = active.current;
    active.current = null;
    controller?.abort();
    setPending(false);
  }, []);
  useEffect(() => abort, [abort]);
  const run = async <T>(
    operation: (signal: AbortSignal) => Promise<T>,
    onResult?: {
      // 写回收敛点：仅成功且未中止时执行，迟到完成在此被守卫拦下
      commit?: (value: T) => void;
      onError?: (error: unknown) => void;
    },
  ) => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError(null);
    try {
      const value = await operation(controller.signal);
      if (!controller.signal.aborted) onResult?.commit?.(value);
    } catch (failure) {
      if (!controller.signal.aborted && !isCancelled(failure)) {
        setError(errorMessage(failure));
        onResult?.onError?.(failure);
      }
    } finally {
      if (!controller.signal.aborted) setPending(false);
      if (active.current === controller) active.current = null;
    }
  };
  return { pending, error, setError, run, abort };
}
