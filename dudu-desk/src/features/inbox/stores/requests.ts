/**
 * Owner of inbox request keys, cancellation and the conversation-domain
 * operation ritual in one module. The key namespace (`InboxRequestKey` +
 * `requestKeys`) is the single spelling of every request slot — global
 * singletons, per-conversation, per-message-media and per-choice-scope — and
 * the helpers below are the only way other modules abort, release, fan out,
 * query or run in-flight work, so `runtime.requests` stays an implementation
 * detail of this file. A new per-conversation request registers once in
 * CONVERSATION_REQUEST_KINDS: its key and its runConversationOperation slot
 * both derive from that table.
 */
import { type ApiFailure, DeskApiError, failureOf } from "@/lib/api-response";
import { createRequestScope, type RequestScope } from "@/lib/request-scope";
import type { RequestOptions, WorkContext } from "../types";
import type { InboxRootState, InboxRuntime } from "./store";

/** Single spelling of the transient-failure copy for inbox operations: any
 *  error that is neither a DeskApiError nor an abort reads as a network
 *  failure with this copy, in every loader and saver. */
export function operationFailure(error: unknown): ApiFailure {
  return failureOf(error, "暂时无法连接服务，请稍后重试");
}

/** Per-conversation request kinds. The per-conversation key constructors in
 *  `requestKeys` and the runConversationOperation slot domain both derive from
 *  this table, so a new per-conversation request registers here once and runs
 *  through the conversation operation interface. */
const CONVERSATION_REQUEST_KINDS = [
  "history",
  "profile",
  "profile-save",
  "send",
  "end",
] as const;

/** The runConversationOperation slot domain: one entry per row of
 *  CONVERSATION_REQUEST_KINDS. */
type ConversationRequestKind = (typeof CONVERSATION_REQUEST_KINDS)[number];

/** Slot-key protocol for inbox requests: global singletons plus namespaced
 *  per-owner keys. A key must match one of these shapes to typecheck at
 *  `beginRequest`/`runOperation`; `requestKeys` builds the sanctioned
 *  spellings for the slots other modules still address directly — running a
 *  per-conversation slot goes through runConversationOperation instead. */
type InboxRequestKey =
  | "queue"
  | "events"
  | "recovery"
  | "access"
  | `media:${string}`
  | `choices:${string}`
  | `${(typeof CONVERSATION_REQUEST_KINDS)[number]}:${string}`;

const conversationRequestKey = (
  kind: (typeof CONVERSATION_REQUEST_KINDS)[number],
  conversationId: string,
): InboxRequestKey => `${kind}:${conversationId}`;

/** Constructors for the key protocol. Slot-key constructors return
 *  `InboxRequestKey`; `next` spells a choice scope and reaches a slot key
 *  only through `choices`. Global singletons are constants; every scoped
 *  slot derives from its owner (conversation or message). */
export const requestKeys = {
  queue: "queue",
  events: "events",
  recovery: "recovery",
  access: "access",
  history: (conversationId: string) =>
    conversationRequestKey("history", conversationId),
  profile: (conversationId: string) =>
    conversationRequestKey("profile", conversationId),
  media: (messageId: string, index: number): InboxRequestKey =>
    `media:${messageId}:${index}`,
  choices: (scope: string): InboxRequestKey => `choices:${scope}`,
  /** Choice scope for the next-visitor search started by an accepted reply. */
  next: (messageId: string): `next:${string}` => `next:${messageId}`,
} as const;

/** Escape hatch for long-lived operations (e.g. the inbox subscription) whose
 *  request outlives a single task. Scoped loads should use runOperation, and
 *  per-conversation ones runConversationOperation. */
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
  // 实时订阅不是一次可写回的结果：它跟随连接生命周期，不受范围代数约束（见 access.ts）；
  // 上下文重置与销毁仍然经 dispose 停止订阅，其余请求在代数变化后一律不再写回
  const stable = key === requestKeys.events;
  return {
    context,
    signal,
    current: () =>
      scope.isCurrent(signal) &&
      runtime.requests.get(key) === scope &&
      (stable || getState().inbox.generation === generation),
    finish: () => {
      // Release-only: the ritual deletes the key without aborting, so callers
      // (e.g. queue pagination tests) observe the completed signal as
      // un-aborted; disposing here would abort our own just-settled signal.
      // An interrupted signal (abortRequest) or a re-taken slot releases
      // nothing here — the slot is left for the next begin under the same key
      // or a bulk cancel to reclaim, and late current() checks fail closed on
      // the map mismatch.
      if (runtime.requests.get(key) === scope && scope.isCurrent(signal)) {
        runtime.requests.delete(key);
      }
    },
  };
}

/** Abort the in-flight request under `key` without releasing its slot; the
 *  interrupted operation's own finish sees an aborted signal and leaves the
 *  slot for the next begin under the same key (or a bulk cancel) to reclaim. */
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
}

/**
 * 权限范围变化时取消全部在途读取，只保留实时订阅本身：订阅跟随连接生命周期，
 * 继续接收后续报文（见 requests.ts 的范围代数守卫与 access.ts）。
 */
export function cancelScopeRequests(runtime: InboxRuntime) {
  for (const [key, scope] of runtime.requests) {
    if (key === requestKeys.events) continue;
    scope.dispose();
    runtime.requests.delete(key);
  }
}

type OperationScope = {
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

/** One conversation-domain operation: which api call settles it, what a valid
 *  response matches, and the dispatch effects on each side. */
type ConversationOperation<T> = {
  /** Opens the transition (the xLoading dispatch); runs once before the call. */
  loading: () => void;
  call: (io: RequestOptions) => Promise<T>;
  /** Return a mismatch message to reject the response as invalid-response. */
  validate?: (result: T) => string | undefined;
  /** Success effects; may await follow-up work whose errors fall through to
   *  the failure mapping. */
  loaded: (result: T, op: { current: () => boolean }) => void | Promise<void>;
  /** Failure effect; receives the mapped failure with the shared fallback copy. */
  failed: (failure: ApiFailure) => void;
};

/**
 * Deep module for conversation-domain operations. Owns the whole execution
 * ritual on top of runOperation for every slot in CONVERSATION_REQUEST_KINDS:
 * the loading dispatch, the api call, and one settle guard — an operation
 * settles only while it is still the latest attempt for its key AND its
 * conversation still stands, so a late response can never resurrect a removed
 * conversation's state. It also owns the response-validation idiom (a returned
 * mismatch message becomes one invalid-response failure) and the failure
 * mapping with the shared fallback copy, applied identically to validation
 * misses and failed calls. Loaders and savers spell only which kind runs,
 * which api call settles it, what a valid response matches and what each side
 * dispatches.
 */
export async function runConversationOperation<T>(
  runtime: InboxRuntime,
  getState: () => InboxRootState,
  conversationId: string,
  kind: ConversationRequestKind,
  operation: ConversationOperation<T>,
): Promise<void> {
  await runOperation(
    runtime,
    conversationRequestKey(kind, conversationId),
    getState,
    async (op) => {
      operation.loading();
      // A late result must never resurrect a removed conversation: settle
      // only while this attempt is current and the conversation stands.
      const stands = () =>
        op.current() && !!getState().inbox.conversations[conversationId];
      try {
        const result = await operation.call({
          context: op.context,
          signal: op.signal,
        });
        if (!stands()) return;
        const mismatch = operation.validate?.(result);
        if (mismatch) throw new DeskApiError("invalid-response", mismatch);
        await operation.loaded(result, { current: op.current });
      } catch (error) {
        // 会话已移除：迟到结果不得复活已拆除的会话状态，两种取消都保持吞掉
        if (!getState().inbox.conversations[conversationId]) return;
        // 本次尝试被取消（范围代数递增或重连取消在途读取）时，非发送操作维持吞掉；
        // 发送操作仍要本地结算，否则 submission 永远停在 sending、会话发送锁无法
        // 释放，重连后也没有失败入口可查。取消的错误按 aborted 结算，aborted 归入
        // uncertain（与 sending.ts deliver 的分类一致），等重连重查的回执证据落定
        if (!op.current() && kind !== "send") return;
        operation.failed(operationFailure(error));
      }
    },
  );
}

/**
 * Retry-resume decision for paged reads, shared by the queue and the candidate
 * scopes: a failure on "more" resumes at the cursor it failed on; a failed
 * refresh restarts the read from the first page.
 */
export function failedReadCursor(read: {
  failedRead?: "refresh" | "more";
  nextCursor: string | null;
}): string | undefined {
  return read.failedRead === "more"
    ? (read.nextCursor ?? undefined)
    : undefined;
}
