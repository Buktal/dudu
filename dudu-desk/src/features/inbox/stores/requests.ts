import { createRequestScope } from "@/lib/request-scope";
import type { WorkContext } from "../types";
import type { InboxRootState, InboxRuntime } from "./store";

/** Canonical failure mapping lives in `@/lib/api-response` (shared with the
 *  account session); re-exported here so inbox modules keep one import. */
export { failureOf } from "@/lib/api-response";

/** Escape hatch for long-lived operations (e.g. the inbox subscription) whose
 *  request outlives a single task. Scoped loads should use runOperation. */
export function beginRequest(
  runtime: InboxRuntime,
  key: string,
  getState: () => InboxRootState,
) {
  let scope = runtime.requests.get(key);
  if (!scope) {
    scope = createRequestScope();
    runtime.requests.set(key, scope);
  }
  const signal = scope.begin();
  const { context, generation } = getState().inbox;
  return {
    context,
    signal,
    current: () =>
      scope.isCurrent(signal) &&
      runtime.requests.get(key) === scope &&
      getState().inbox.generation === generation,
    finish: () => {
      // Release-only: the original ritual deleted the key without aborting,
      // and callers (e.g. queue pagination tests) observe the completed
      // signal as un-aborted. Disposing here would abort our own just-settled
      // signal as a side effect. The scope is dropped from the map so it is
      // never reused; late current() checks fail closed on the map mismatch.
      // Abort remains explicit via scope.abort()/cancelRequests.
      if (runtime.requests.get(key) === scope && scope.isCurrent(signal)) {
        runtime.requests.delete(key);
      }
    },
  };
}

export function cancelRequests(runtime: InboxRuntime) {
  for (const scope of runtime.requests.values()) scope.dispose();
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
