import { DeskApiError } from "@/lib/api-response";
import type { WorkContext } from "../types";
import { cancelRequests, failureOf, runOperation } from "./requests";
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
    await runOperation(
      runtime,
      `history:${conversationId}`,
      getState,
      async (op) => {
        dispatch(inboxActions.historyLoading(conversationId));
        try {
          const page = await runtime.api.listMessages({
            context: op.context,
            signal: op.signal,
            conversationId,
            cursor: more ? (history?.nextCursor ?? undefined) : undefined,
          });
          if (getState().inbox.conversations[conversationId])
            op.settle(() =>
              dispatch(inboxActions.historyLoaded({ conversationId, page })),
            );
        } catch (error) {
          if (getState().inbox.conversations[conversationId])
            op.settle(() =>
              dispatch(
                inboxActions.historyFailed({
                  conversationId,
                  error: failureOf(error, "暂时无法连接服务，请稍后重试"),
                }),
              ),
            );
        }
      },
    );
  };
}

export function loadProfile(
  conversationId: string,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    await runOperation(
      runtime,
      `profile:${conversationId}`,
      getState,
      async (op) => {
        dispatch(inboxActions.profileLoading(conversationId));
        try {
          const profile = await runtime.api.readProfile({
            context: op.context,
            signal: op.signal,
            conversationId,
          });
          if (getState().inbox.conversations[conversationId]) {
            if (profile.conversationId !== conversationId)
              throw new DeskApiError(
                "invalid-response",
                "资料响应与当前会话不匹配",
              );
            op.settle(() => dispatch(inboxActions.profileLoaded(profile)));
          }
        } catch (error) {
          if (getState().inbox.conversations[conversationId])
            op.settle(() =>
              dispatch(
                inboxActions.profileFailed({
                  conversationId,
                  error: failureOf(error, "暂时无法连接服务，请稍后重试"),
                }),
              ),
            );
        }
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
    await runOperation(
      runtime,
      `read:${conversationId}`,
      getState,
      async (op) => {
        dispatch(inboxActions.readStarted({ conversationId, throughSequence }));
        try {
          const conversation = await runtime.api.markRead({
            context: op.context,
            signal: op.signal,
            conversationId,
            throughSequence,
          });
          if (!op.current() || !getState().inbox.conversations[conversationId])
            return;
          if (conversation.id !== conversationId)
            throw new DeskApiError(
              "invalid-response",
              "已读确认未关联到当前会话",
            );
          dispatch(
            inboxActions.readConfirmed({ conversation, throughSequence }),
          );
        } catch (error) {
          op.settle(() =>
            dispatch(
              inboxActions.readFailed({
                conversationId,
                error: failureOf(error, "暂时无法连接服务，请稍后重试"),
              }),
            ),
          );
        }
      },
    );
  };
}
