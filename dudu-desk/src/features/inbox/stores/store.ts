import {
  configureStore,
  type ThunkAction,
  type UnknownAction,
} from "@reduxjs/toolkit";
import type { RequestScope } from "@/lib/request-scope";
import { nowIso } from "@/lib/time";
import type { InboxApi } from "../api";
import type { WorkContext } from "../types";
import { createSettledBus, type SettledBus } from "./live-refresh";
import { inboxReducer } from "./slice";
import { type InboxState, initialInboxState } from "./state";

export type InboxRuntime = {
  api: InboxApi;
  now: () => string;
  id: () => string;
  /** Request slots; keyed and cancelled only through stores/requests.ts. */
  requests: Map<string, RequestScope>;
  /**
   * Startup gate between the live subscription and the first queue read: while
   * the socket subscription is in flight and the connection is still
   * "connecting", business reads wait for it to settle (ready or failed), so a
   * message persisted in between cannot fall through both the push and the
   * initial query. Touch only through the helpers below.
   */
  connection: ConnectionGate;
  /**
   * Coordination seam between the Conversation queue and Live events modules:
   * the queue notifies after every refresh/more settles (see queue.ts), and
   * the Live events refresh scheduler listens to re-read once the queue is
   * idle (see live-refresh.ts). Touch only through the helpers below.
   */
  queueEvents: SettledBus;
  files: Map<string, File>;
  previews: Map<string, string>;
  unsubscribe?: () => void;
};

/** Notify Live events that a queue read settled (success or failure). */
export function notifyQueueSettled(runtime: Pick<InboxRuntime, "queueEvents">) {
  runtime.queueEvents.notify();
}

/** Listen for queue-settled signals; aborts with the given signal. */
export function onQueueSettled(
  runtime: Pick<InboxRuntime, "queueEvents">,
  listener: () => void,
  signal: AbortSignal,
) {
  runtime.queueEvents.subscribe(listener, signal);
}

/**
 * 初始读取闸门：Socket 订阅已报告 ready 或失败后释放，幂等（重复释放无害）。
 */
export type ConnectionGate = {
  readonly settled: Promise<void>;
  release: () => void;
};

function createConnectionGate(): ConnectionGate {
  let release = () => {};
  const settled = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { settled, release };
}

/** Release the startup gate once the subscription has left "connecting". */
export function releaseConnection(runtime: Pick<InboxRuntime, "connection">) {
  runtime.connection.release();
}

/** Wait for the connection to leave "connecting"; a cancelled read ends as an abort. */
export function awaitConnectionSettled(
  runtime: Pick<InboxRuntime, "connection">,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("操作已取消", "AbortError"));
      return;
    }
    runtime.connection.settled.then(resolve);
    signal.addEventListener(
      "abort",
      () => reject(new DOMException("操作已取消", "AbortError")),
      { once: true },
    );
  });
}

export type InboxRootState = { inbox: InboxState };
export type InboxCommand<R = void> = ThunkAction<
  R,
  InboxRootState,
  InboxRuntime,
  UnknownAction
>;

export function createInboxStore(options: {
  api: InboxApi;
  context: WorkContext;
  now?: () => string;
  id?: () => string;
}) {
  const runtime: InboxRuntime = {
    api: options.api,
    now: options.now ?? nowIso,
    id: options.id ?? (() => crypto.randomUUID()),
    requests: new Map(),
    connection: createConnectionGate(),
    queueEvents: createSettledBus(),
    files: new Map(),
    previews: new Map(),
  };
  return configureStore({
    reducer: { inbox: inboxReducer },
    preloadedState: { inbox: initialInboxState(options.context) },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({ thunk: { extraArgument: runtime } }),
  });
}

export type InboxStore = ReturnType<typeof createInboxStore>;
export type InboxDispatch = InboxStore["dispatch"];
