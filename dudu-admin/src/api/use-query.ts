import { useCallback, useEffect, useState } from "react";
import { errorMessage, isCancelled } from "./client";

export function useQuery<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    load: typeof load;
    data: T | null;
    error: string | null;
    loading: boolean;
    attempt: number;
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
  return {
    ...(result.load === load && result.attempt === attempt
      ? result
      : { data: null, error: null, loading: true }),
    refresh,
  };
}
