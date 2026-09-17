import type { ConversationQuery, InboxEvent } from "../types";
import { loadConversations } from "./queue";
import { needsQueueRefreshForEvent } from "./queue-membership";
import type { InboxState } from "./state";
import type { InboxDispatch, InboxRootState, InboxRuntime } from "./store";

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
