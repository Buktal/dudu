import { type ApiFailure, DeskApiError } from "@/lib/api-response";
import type { WorkContext } from "../types";
import type { InboxRootState, InboxRuntime } from "./store";

export function failureOf(error: unknown): ApiFailure {
  if (error instanceof DeskApiError) {
    return { kind: error.kind, message: error.message, code: error.code };
  }
  if (error instanceof Error && error.name === "AbortError") {
    return { kind: "aborted", message: "操作已取消" };
  }
  return { kind: "network", message: "暂时无法连接服务，请稍后重试" };
}

/** Escape hatch for long-lived operations (e.g. the inbox subscription) whose
 *  request outlives a single task. Scoped loads should use runOperation. */
export function beginRequest(
  runtime: InboxRuntime,
  key: string,
  getState: () => InboxRootState,
) {
  runtime.requests.get(key)?.abort();
  const controller = new AbortController();
  runtime.requests.set(key, controller);
  const { context, generation } = getState().inbox;
  return {
    context,
    signal: controller.signal,
    current: () =>
      !controller.signal.aborted &&
      runtime.requests.get(key) === controller &&
      getState().inbox.generation === generation,
    finish: () => {
      if (runtime.requests.get(key) === controller)
        runtime.requests.delete(key);
    },
  };
}

export function cancelRequests(runtime: InboxRuntime) {
  for (const controller of runtime.requests.values()) controller.abort();
  runtime.requests.clear();
  runtime.unsubscribe?.();
  runtime.unsubscribe = undefined;
  for (const url of runtime.previews.values()) URL.revokeObjectURL(url);
  runtime.previews.clear();
  runtime.files.clear();
}

export function releaseAttachmentResources(
  runtime: InboxRuntime,
  ids: string[],
) {
  for (const id of ids) {
    runtime.requests.get(`attachment:${id}`)?.abort();
    runtime.requests.delete(`attachment:${id}`);
    const preview = runtime.previews.get(id);
    if (preview) URL.revokeObjectURL(preview);
    runtime.previews.delete(id);
    runtime.files.delete(id);
  }
}

export type OperationScope = {
  context: WorkContext;
  signal: AbortSignal;
  /** True while this operation is still the latest for its key and generation. */
  current: () => boolean;
  /** Run an effect (typically a dispatch) only while the operation is current. */
  settle: (effect: () => void) => void;
};

/**
 * Deep module for scoped inbox operations. Owns the abort/generation/finish
 * ritual: aborts the previous operation under `key`, runs `task`, and always
 * releases the key — even on early return or throw. Return values and
 * exceptions propagate to the caller unchanged.
 */
export async function runOperation<T>(
  runtime: InboxRuntime,
  key: string,
  getState: () => InboxRootState,
  task: (scope: OperationScope) => Promise<T>,
): Promise<T> {
  const request = beginRequest(runtime, key, getState);
  const scope: OperationScope = {
    context: request.context,
    signal: request.signal,
    current: request.current,
    settle: (effect) => {
      if (request.current()) effect();
    },
  };
  try {
    return await task(scope);
  } finally {
    request.finish();
  }
}
