import type { ConversationQuery, InboxEvent } from "../types";
import { loadConversations } from "./queue";
import { needsQueueRefreshForEvent } from "./queue-membership";
import type { InboxState } from "./state";
import type { InboxDispatch, InboxRootState, InboxRuntime } from "./store";

/**
 * Typed settled bus: the coordination seam between the Conversation queue and
 * Live events modules. The queue notifies after every refresh/more settles;
 * the refresh scheduler subscribes to re-read once the queue is idle. A small
 * typed module — not an EventTarget string — so the signal cannot typo-drift
 * and no other module can listen in by accident.
 */
export type SettledBus = {
  notify: () => void;
  subscribe: (listener: () => void, signal: AbortSignal) => void;
};

export function createSettledBus(): SettledBus {
  const listeners = new Set<() => void>();
  return {
    notify() {
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener, signal) {
      if (signal.aborted) return;
      listeners.add(listener);
      signal.addEventListener("abort", () => listeners.delete(listener), {
        once: true,
      });
    },
  };
}

/**
 * Live events refresh scheduler: the single module that decides *when* live
 * activity triggers a Conversation queue re-read.
 *
 * Live subscription events, queue settled signals and recovery completions all
 * answer through here, so the idle gate (connected + no queue request in
 * flight + no queue error) and the microtask coalescing change in one module
 * instead of spreading across the subscription closure.
 */
export function createRefreshScheduler(input: {
  isCurrent: () => boolean;
  getState: () => InboxRootState;
  dispatch: InboxDispatch;
  runtime: InboxRuntime;
}): {
  noteEvent: (event: InboxEvent, previous: InboxState) => void;
  noteSettled: () => void;
} {
  const { isCurrent, getState, dispatch, runtime } = input;
  let refreshQueued = false;
  let pendingQuery: ConversationQuery | undefined;

  const scheduleCoalescedRefresh = () => {
    if (refreshQueued || !pendingQuery) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      const state = getState().inbox;
      if (!isCurrent() || state.queue.query !== pendingQuery) {
        pendingQuery = undefined;
        return;
      }
      if (
        state.connection !== "connected" ||
        runtime.requests.has("queue") ||
        state.queue.error
      )
        return;
      pendingQuery = undefined;
      void dispatch(loadConversations());
    });
  };

  return {
    noteEvent(event, previous) {
      const state = getState().inbox;
      if (state === previous) return;
      if (
        !needsQueueRefreshForEvent(
          event.type,
          state.queue.query,
          state.queue.counts,
        )
      )
        return;
      pendingQuery = state.queue.query;
      scheduleCoalescedRefresh();
    },
    noteSettled() {
      scheduleCoalescedRefresh();
    },
  };
}
