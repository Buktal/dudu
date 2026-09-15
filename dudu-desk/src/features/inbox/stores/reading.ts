import { DeskApiError } from "@/lib/api-response";
import type { ConversationQuery, WorkContext } from "../types";
import { beginRequest, cancelRequests, failureOf } from "./requests";
import { inboxActions } from "./slice";
import type { InboxCommand } from "./store";

export function loadConversations(
  options: { query?: ConversationQuery; more?: boolean } = {},
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const state = getState().inbox;
    const queue = state.queue;
    if (options.more && (!queue.nextCursor || queue.status === "loading"))
      return;
    const versions = new Map(
      Object.values(state.conversations).map(({ id, version }) => [
        id,
        version,
      ]),
    );
    const request = beginRequest(runtime, "queue", getState);
    dispatch(inboxActions.queueLoading(options.query));
    try {
      const page = await runtime.api.listConversations({
        context: request.context,
        signal: request.signal,
        query: options.query ?? queue.query,
        cursor: options.more ? (queue.nextCursor ?? undefined) : undefined,
      });
      if (!request.current()) return;
      const latest = getState().inbox;
      const preserveIds = latest.queue.ids.filter(
        (id) => latest.conversations[id].version > (versions.get(id) ?? -1),
      );
      dispatch(
        inboxActions.queueLoaded({ page, append: !!options.more, preserveIds }),
      );
      const current = getState().inbox;
      if (
        !current.activeId &&
        current.selectionRevision === 0 &&
        current.queue.ids.length
      ) {
        await dispatch(selectConversation(current.queue.ids[0]));
      }
    } catch (error) {
      if (request.current())
        dispatch(inboxActions.queueFailed(failureOf(error)));
    } finally {
      request.finish();
    }
  };
}

export function loadHistory(
  conversationId: string,
  more = false,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const history = getState().inbox.histories[conversationId];
    if (!getState().inbox.conversations[conversationId]) return;
    if (more && (!history?.nextCursor || history.status === "loading")) return;
    const request = beginRequest(
      runtime,
      `history:${conversationId}`,
      getState,
    );
    dispatch(inboxActions.historyLoading(conversationId));
    try {
      const page = await runtime.api.listMessages({
        context: request.context,
        signal: request.signal,
        conversationId,
        cursor: more ? (history?.nextCursor ?? undefined) : undefined,
      });
      if (request.current() && getState().inbox.conversations[conversationId])
        dispatch(inboxActions.historyLoaded({ conversationId, page }));
    } catch (error) {
      if (request.current() && getState().inbox.conversations[conversationId])
        dispatch(
          inboxActions.historyFailed({
            conversationId,
            error: failureOf(error),
          }),
        );
    } finally {
      request.finish();
    }
  };
}

export function loadProfile(
  conversationId: string,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const request = beginRequest(
      runtime,
      `profile:${conversationId}`,
      getState,
    );
    dispatch(inboxActions.profileLoading(conversationId));
    try {
      const profile = await runtime.api.readProfile({
        context: request.context,
        signal: request.signal,
        conversationId,
      });
      if (request.current() && getState().inbox.conversations[conversationId]) {
        if (profile.conversationId !== conversationId)
          throw new DeskApiError(
            "invalid-response",
            "资料响应与当前会话不匹配",
          );
        dispatch(inboxActions.profileLoaded(profile));
      }
    } catch (error) {
      if (request.current() && getState().inbox.conversations[conversationId])
        dispatch(
          inboxActions.profileFailed({
            conversationId,
            error: failureOf(error),
          }),
        );
    } finally {
      request.finish();
    }
  };
}

export function selectConversation(
  conversationId: string,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const state = getState().inbox;
    if (!state.conversations[conversationId]) return;
    if (state.pinnedId === conversationId) {
      dispatch(inboxActions.pinnedRestored());
    } else {
      if (
        state.activeId &&
        state.activeId !== conversationId &&
        state.activeId !== state.pinnedId
      ) {
        const historyKey = `history:${state.activeId}`;
        const historyRequest = runtime.requests.get(historyKey);
        if (historyRequest) {
          historyRequest.abort();
          if (runtime.requests.get(historyKey) === historyRequest) {
            runtime.requests.delete(historyKey);
            dispatch(inboxActions.historyCancelled(state.activeId));
          }
        }
        runtime.requests.get(`profile:${state.activeId}`)?.abort();
      }
      dispatch(inboxActions.conversationSelected(conversationId));
    }
    await dispatch(ensureConversationLoaded(conversationId));
  };
}

export function ensureConversationLoaded(
  conversationId: string,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState) => {
    const state = getState().inbox;
    if (!state.conversations[conversationId]) return;
    await Promise.all([
      !state.histories[conversationId]?.hasLoaded
        ? dispatch(loadHistory(conversationId))
        : undefined,
      state.profiles[conversationId]?.status !== "ready"
        ? dispatch(loadProfile(conversationId))
        : undefined,
    ]);
  };
}

export function resetContext(context: WorkContext): InboxCommand {
  return (dispatch, _getState, runtime) => {
    cancelRequests(runtime);
    dispatch(inboxActions.contextReset(context));
  };
}

export function destroyInbox(): InboxCommand {
  return (dispatch, getState, runtime) => {
    cancelRequests(runtime);
    dispatch(inboxActions.contextReset(getState().inbox.context));
  };
}
