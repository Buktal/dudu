import type { WorkContext } from "../types";
import {
  abortRequest,
  cancelRequests,
  failedReadCursor,
  releaseRequest,
  requestKeys,
  runConversationOperation,
} from "./requests";
import { inboxActions } from "./slice";
import type { InboxCommand } from "./store";

export function loadHistory(
  conversationId: string,
  more = false,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const history = getState().inbox.histories[conversationId];
    if (!getState().inbox.conversations[conversationId]) return;
    if (more && (!history?.nextCursor || history.status === "loading")) return;
    await runConversationOperation(
      runtime,
      getState,
      conversationId,
      "history",
      {
        loading: () => dispatch(inboxActions.historyLoading(conversationId)),
        call: (io) =>
          runtime.api.listMessages({
            ...io,
            conversationId,
            cursor: more ? (history?.nextCursor ?? undefined) : undefined,
          }),
        loaded: (page) => {
          dispatch(inboxActions.historyLoaded({ conversationId, page }));
        },
        failed: (failure) =>
          dispatch(
            inboxActions.historyFailed({
              conversationId,
              error: failure,
              more,
            }),
          ),
      },
    );
  };
}

export function retryHistory(
  conversationId: string,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState) => {
    const history = getState().inbox.histories[conversationId];
    if (!history?.error || history.status === "loading") return;
    await dispatch(loadHistory(conversationId, !!failedReadCursor(history)));
  };
}

export function loadProfile(
  conversationId: string,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    await runConversationOperation(
      runtime,
      getState,
      conversationId,
      "profile",
      {
        loading: () => dispatch(inboxActions.profileLoading(conversationId)),
        call: (io) => runtime.api.readProfile({ ...io, conversationId }),
        validate: (profile) =>
          profile.conversationId !== conversationId
            ? "资料响应与当前会话不匹配"
            : undefined,
        loaded: (profile) => {
          dispatch(inboxActions.profileLoaded(profile));
        },
        failed: (failure) =>
          dispatch(
            inboxActions.profileFailed({ conversationId, error: failure }),
          ),
      },
    );
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
        if (releaseRequest(runtime, requestKeys.history(state.activeId)))
          dispatch(inboxActions.historyCancelled(state.activeId));
        abortRequest(runtime, requestKeys.profile(state.activeId));
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

export function markConversationRead(
  conversationId: string,
  throughSequence: number,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const state = getState().inbox;
    if (
      !state.conversations[conversationId] ||
      state.connection !== "connected" ||
      !Number.isSafeInteger(throughSequence) ||
      throughSequence <= 0 ||
      throughSequence <=
        Math.max(
          state.events.readThrough[conversationId] ?? 0,
          state.events.readingThrough[conversationId] ?? 0,
        )
    )
      return;
    await runConversationOperation(runtime, getState, conversationId, "read", {
      loading: () =>
        dispatch(inboxActions.readStarted({ conversationId, throughSequence })),
      call: (io) =>
        runtime.api.markRead({ ...io, conversationId, throughSequence }),
      validate: (conversation) =>
        conversation.id !== conversationId
          ? "已读确认未关联到当前会话"
          : undefined,
      loaded: (conversation) => {
        dispatch(inboxActions.readConfirmed({ conversation, throughSequence }));
      },
      failed: (failure) =>
        dispatch(inboxActions.readFailed({ conversationId, error: failure })),
    });
  };
}
