import { useEffect, useRef, useState } from "react";
import { errorMessage, isCancelled } from "./client";

export function useMutation() {
  const active = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  const run = async (
    operation: (signal: AbortSignal) => Promise<void>,
    onError?: (error: unknown) => void,
  ) => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setPending(true);
    setError(null);
    try {
      await operation(controller.signal);
    } catch (failure) {
      if (!controller.signal.aborted && !isCancelled(failure)) {
        setError(errorMessage(failure));
        onError?.(failure);
      }
    } finally {
      if (!controller.signal.aborted) setPending(false);
      if (active.current === controller) active.current = null;
    }
  };
  return { pending, error, setError, run };
}
