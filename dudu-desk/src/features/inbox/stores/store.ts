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
   * the queue dispatches "settled" after every refresh/more settles (see
   * queue.ts), and Live events listens to schedule a query refresh once the
   * queue is idle (see events.ts). No other module touches this target.
   */
  queueEvents: EventTarget;
  files: Map<string, File>;
  previews: Map<string, string>;
  unsubscribe?: () => void;
};

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
