/**
 * Owner of inbox request keys and cancellation in one module. The key
 * namespace (`InboxRequestKey` + `requestKeys`) is the single spelling of
 * every request slot — global singletons, per-conversation, per-attachment
 * and per-choice-scope — and the helpers below are the only way other modules
 * abort, release, fan out or query in-flight work, so `runtime.requests`
 * stays an implementation detail of this file. A new per-conversation request
 * registers once in CONVERSATION_REQUEST_KINDS: its key constructor and the
 * removed-conversation cancellation both derive from that table.
 */
import { createRequestScope, type RequestScope } from "@/lib/request-scope";
import type { WorkContext } from "../types";
import type { InboxRootState, InboxRuntime } from "./store";

/** Canonical failure mapping lives in `@/lib/api-response` (shared with the
 *  account session); re-exported here so inbox modules keep one import. */
export { failureOf } from "@/lib/api-response";

/** Per-conversation request kinds. The per-conversation key constructors in
 *  `requestKeys` and `cancelConversationRequests` both derive from this
 *  table, so a new per-conversation request registers here once and is
 *  cancelled with the rest when its conversation is removed. */
const CONVERSATION_REQUEST_KINDS = [
  "history",
  "profile",
  "profile-save",
  "send",
  "read",
  "star",
  "end",
] as const;

/** Slot-key protocol for inbox requests: global singletons plus namespaced
 *  per-owner keys. A key must match one of these shapes to typecheck at
 *  `beginRequest`/`runOperation`; `requestKeys` builds the sanctioned
 *  spellings. */
export type InboxRequestKey =
  | "queue"
  | "events"
  | "recovery"
  | `attachment:${string}`
  | `choices:${string}`
  | `${(typeof CONVERSATION_REQUEST_KINDS)[number]}:${string}`;

const conversationRequestKey = (
  kind: (typeof CONVERSATION_REQUEST_KINDS)[number],
  conversationId: string,
): InboxRequestKey => `${kind}:${conversationId}`;

/** Constructors for the key protocol. Slot-key constructors return
 *  `InboxRequestKey`; `next` spells a choice scope and reaches a slot key
 *  only through `choices`. Global singletons are constants; every scoped
 *  slot derives from its owner (conversation, attachment, message). */
export const requestKeys = {
  queue: "queue",
  events: "events",
  recovery: "recovery",
  history: (conversationId: string) =>
    conversationRequestKey("history", conversationId),
  profile: (conversationId: string) =>
    conversationRequestKey("profile", conversationId),
  profileSave: (conversationId: string) =>
    conversationRequestKey("profile-save", conversationId),
  send: (conversationId: string) =>
    conversationRequestKey("send", conversationId),
  read: (conversationId: string) =>
    conversationRequestKey("read", conversationId),
  star: (conversationId: string) =>
    conversationRequestKey("star", conversationId),
  end: (conversationId: string) =>
    conversationRequestKey("end", conversationId),
  attachment: (attachmentId: string): InboxRequestKey =>
    `attachment:${attachmentId}`,
  choices: (scope: string): InboxRequestKey => `choices:${scope}`,
  /** Choice scope for the next-visitor search started by an accepted reply. */
  next: (messageId: string): `next:${string}` => `next:${messageId}`,
} as const;

/** Escape hatch for long-lived operations (e.g. the inbox subscription) whose
 *  request outlives a single task. Scoped loads should use runOperation. */
export function beginRequest(
  runtime: InboxRuntime,
  key: InboxRequestKey,
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

/** Abort the in-flight request under `key` without releasing its slot; the
 *  running operation still settles and releases through its own finish. */
export function abortRequest(runtime: InboxRuntime, key: InboxRequestKey) {
  runtime.requests.get(key)?.abort();
}

/** Abort the request under `key` and release the slot. Returns true only
 *  when the aborted scope was still the registered one and this call
 *  released it — false when nothing was in flight or the slot had already
 *  been retaken; callers may announce the cancellation (e.g.
 *  historyCancelled on a conversation switch) only on true. */
export function releaseRequest(
  runtime: InboxRuntime,
  key: InboxRequestKey,
): boolean {
  const scope = runtime.requests.get(key);
  if (!scope) return false;
  scope.abort();
  if (runtime.requests.get(key) !== scope) return false;
  runtime.requests.delete(key);
  return true;
}

/** Cancel every per-conversation request under `conversationId` (the kinds
 *  in CONVERSATION_REQUEST_KINDS). Attachment slots are not covered; they
 *  release together with their resources via releaseAttachmentResources. */
export function cancelConversationRequests(
  runtime: InboxRuntime,
  conversationId: string,
) {
  for (const kind of CONVERSATION_REQUEST_KINDS)
    releaseRequest(runtime, conversationRequestKey(kind, conversationId));
}

/** The registered scope under `key`, when in flight; callers hold it as the
 *  kill switch for a long-lived request (e.g. the live subscription). */
export function getRequestScope(
  runtime: InboxRuntime,
  key: InboxRequestKey,
): RequestScope | undefined {
  return runtime.requests.get(key);
}

/** True while a request is in flight under `key` (begun, not yet released),
 *  e.g. the queue gate for live refresh scheduling. */
export function hasInFlightRequest(
  runtime: InboxRuntime,
  key: InboxRequestKey,
): boolean {
  return runtime.requests.has(key);
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
    runtime.requests.get(requestKeys.attachment(id))?.abort();
    runtime.requests.delete(requestKeys.attachment(id));
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
  key: InboxRequestKey,
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
