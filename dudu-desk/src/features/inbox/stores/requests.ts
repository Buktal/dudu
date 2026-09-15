import { type ApiFailure, DeskApiError } from "@/lib/api-response";
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
