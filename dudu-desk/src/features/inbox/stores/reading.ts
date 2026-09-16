import { DeskApiError } from "@/lib/api-response";
import type {
  ConversationPage,
  ConversationQuery,
  WorkContext,
} from "../types";
import { cancelRequests, failureOf, runOperation } from "./requests";
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
    // The settled signal must fire after the operation releases its key:
    // refresh coordination skips while a queue request is in flight.
    try {
      await runOperation(runtime, "queue", getState, async (op) => {
        dispatch(inboxActions.queueLoading(options.query));
        try {
          const page: ConversationPage = { items: [], nextCursor: null };
          // Re-find mounted cards before pruning service-owned search membership.
          const remainingIds = new Set(
            options.more || options.query ? [] : queue.ids,
          );
          const loadedIds = new Set<string>();
          const cursors = new Set<string>();
          let cursor = options.more
            ? (queue.nextCursor ?? undefined)
            : undefined;
          do {
            if (cursor) cursors.add(cursor);
            const nextPage = await runtime.api.listConversations({
              context: op.context,
              signal: op.signal,
              query: options.query ?? queue.query,
              cursor,
            });
            if (!op.current()) return;
            if (nextPage.nextCursor && cursors.has(nextPage.nextCursor))
              throw new DeskApiError(
                "invalid-response",
                "会话列表返回了重复游标，请刷新后重试",
              );
            page.items.push(...nextPage.items);
            const previousSize = loadedIds.size;
            for (const item of nextPage.items) {
              loadedIds.add(item.id);
              remainingIds.delete(item.id);
            }
            page.nextCursor = nextPage.nextCursor;
            page.total = nextPage.total ?? page.total;
            page.counts = nextPage.counts ?? page.counts;
            page.channels = nextPage.channels ?? page.channels;
            if (!page.nextCursor || !remainingIds.size) break;
            if (loadedIds.size === previousSize)
              throw new DeskApiError(
                "invalid-response",
                "会话列表分页没有继续前进，请刷新后重试",
              );
            cursor = page.nextCursor;
          } while (cursor);
          const latest = getState().inbox;
          const preserveIds = latest.queue.ids.filter(
            (id) => latest.conversations[id].version > (versions.get(id) ?? -1),
          );
          op.settle(() =>
            dispatch(
              inboxActions.queueLoaded({
                page,
                append: !!options.more,
                preserveIds,
              }),
            ),
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
          op.settle(() =>
            dispatch(
              inboxActions.queueFailed({
                error: failureOf(error),
                more: !!options.more,
              }),
            ),
          );
        }
      });
    } finally {
      runtime.queueEvents.dispatchEvent(new Event("settled"));
    }
  };
}

export function retryConversations(): InboxCommand<Promise<void>> {
  return async (dispatch, getState) => {
    const queue = getState().inbox.queue;
    if (!queue.error || queue.status === "loading") return;
    await dispatch(
      loadConversations({
        more: queue.failedRead === "more" && !!queue.nextCursor,
      }),
    );
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
                  error: failureOf(error),
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
                  error: failureOf(error),
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
