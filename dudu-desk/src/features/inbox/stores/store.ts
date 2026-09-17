import {
  configureStore,
  type ThunkAction,
  type UnknownAction,
} from "@reduxjs/toolkit";
import { nowIso } from "@/lib/time";
import type { InboxApi } from "../api";
import type { WorkContext } from "../types";
import { inboxReducer } from "./slice";
import { type InboxState, initialInboxState } from "./state";

export type InboxRuntime = {
  api: InboxApi;
  now: () => string;
  id: () => string;
  requests: Map<string, AbortController>;
  /**
   * Coordination seam between the Conversation queue and Live events modules:
   * the queue notifies after every refresh/more settles (see queue.ts), and
   * the Live events refresh scheduler listens to re-read once the queue is
   * idle (see live-refresh.ts). Touch only through the helpers below so the
   * event name stays in one module.
   */
  queueEvents: EventTarget;
  files: Map<string, File>;
  previews: Map<string, string>;
  unsubscribe?: () => void;
};

/** Name of the queue-settled signal on `InboxRuntime.queueEvents`. */
export const QUEUE_SETTLED_EVENT = "settled";

/** Notify Live events that a queue read settled (success or failure). */
export function notifyQueueSettled(runtime: Pick<InboxRuntime, "queueEvents">) {
  runtime.queueEvents.dispatchEvent(new Event(QUEUE_SETTLED_EVENT));
}

/** Listen for queue-settled signals; aborts with the given signal. */
export function onQueueSettled(
  runtime: Pick<InboxRuntime, "queueEvents">,
  listener: () => void,
  signal: AbortSignal,
) {
  runtime.queueEvents.addEventListener(QUEUE_SETTLED_EVENT, listener, {
    signal,
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
    queueEvents: new EventTarget(),
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
