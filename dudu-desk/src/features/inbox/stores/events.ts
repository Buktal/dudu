import type { ConversationQuery, InboxEvent } from "../types";
import { loadConversations } from "./queue";
import { needsQueueRefreshForEvent } from "./queue-membership";
import {
  connectionFromFailure,
  reconcileInbox,
  settleConfirmedReplies,
} from "./reconciler";
import {
  beginRequest,
  failureOf,
  releaseAttachmentResources,
} from "./requests";
import { inboxActions } from "./slice";
import type { InboxCommand } from "./store";

function connectInbox(reconnecting: boolean): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    runtime.unsubscribe?.();
    runtime.requests.get("recovery")?.abort();
    const request = beginRequest(runtime, "events", getState);
    const controller = runtime.requests.get("events");
    let needsRecovery =
      reconnecting ||
      ["disconnected", "unavailable"].includes(getState().inbox.connection);
    let recovery: Promise<void> | undefined;
    let queryRefreshQueued = false;
    let pendingQuery: ConversationQuery | undefined;
    const scheduleQueryRefresh = () => {
      if (queryRefreshQueued || !pendingQuery) return;
      queryRefreshQueued = true;
      queueMicrotask(() => {
        queryRefreshQueued = false;
        const state = getState().inbox;
        if (!request.current() || state.queue.query !== pendingQuery) {
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
    runtime.queueEvents.addEventListener("settled", scheduleQueryRefresh, {
      signal: request.signal,
    });
    dispatch(
      inboxActions.connectionChanged(
        reconnecting ? "reconnecting" : "connecting",
      ),
    );
    try {
      const unsubscribe = runtime.api.subscribe({
        context: request.context,
        signal: request.signal,
        cursor: getState().inbox.events.cursor ?? undefined,
        onEvent: (event) => {
          if (!request.current()) return;
          const previous = getState().inbox;
          dispatch(receiveInboxEvent(event));
          const state = getState().inbox;
          if (
            state === previous ||
            !needsQueueRefreshForEvent(
              event.type,
              state.queue.query,
              state.queue.counts,
            )
          )
            return;
          pendingQuery = state.queue.query;
          scheduleQueryRefresh();
        },
        onConnection: (connection) => {
          if (!request.current()) return;
          if (connection === "connected") {
            if (recovery) return;
            if (
              needsRecovery ||
              getState().inbox.connection === "disconnected"
            ) {
              needsRecovery = false;
              const task = dispatch(reconcileInbox(request.current));
              recovery = task;
              void task.finally(() => {
                if (recovery === task) {
                  recovery = undefined;
                  scheduleQueryRefresh();
                }
              });
            } else {
              dispatch(inboxActions.connectionChanged("connected"));
              scheduleQueryRefresh();
            }
          } else {
            needsRecovery = true;
            runtime.requests.get("recovery")?.abort();
            recovery = undefined;
            dispatch(inboxActions.connectionChanged(connection));
          }
        },
      });
      if (!request.current()) {
        unsubscribe();
        return;
      }
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        controller?.abort();
        runtime.requests.get("recovery")?.abort();
        request.finish();
        unsubscribe();
        if (runtime.unsubscribe === stop) runtime.unsubscribe = undefined;
      };
      runtime.unsubscribe = stop;
      await recovery;
    } catch (error) {
      const current = request.current();
      controller?.abort();
      request.finish();
      if (current)
        dispatch(
          inboxActions.connectionChanged(
            connectionFromFailure(failureOf(error)),
          ),
        );
    }
  };
}

export function startInboxUpdates(): InboxCommand<Promise<void>> {
  return connectInbox(false);
}

export function reconnectInbox(): InboxCommand<Promise<void>> {
  return connectInbox(true);
}

function receiveInboxEvent(event: InboxEvent): InboxCommand {
  return (dispatch, getState, runtime) => {
    const previous = getState().inbox;
    dispatch(inboxActions.eventReceived(event));
    const state = getState().inbox;
    if (state === previous) return;
    if (
      event.type === "removed" &&
      !state.conversations[event.conversationId] &&
      state.events.removed[event.conversationId] === event.version
    ) {
      const id = event.conversationId;
      for (const prefix of [
        "history",
        "profile",
        "profile-save",
        "send",
        "read",
        "star",
        "end",
      ]) {
        const key = `${prefix}:${id}`;
        runtime.requests.get(key)?.abort();
        runtime.requests.delete(key);
      }
      releaseAttachmentResources(
        runtime,
        Object.values(previous.attachments)
          .filter((attachment) => attachment.conversationId === id)
          .map((attachment) => attachment.id),
      );
    }
    if (event.type === "message" || event.type === "receipt")
      dispatch(settleConfirmedReplies());
  };
}
