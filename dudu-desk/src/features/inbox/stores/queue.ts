import { createSelector } from "@reduxjs/toolkit";
import { DeskApiError } from "@/lib/api-response";
import { compareConversations } from "../conversation-query";
import type { ConversationPage, ConversationQuery } from "../types";
import { selectConversation } from "./reading";
import { failureOf, runOperation } from "./requests";
import { inboxActions } from "./slice";
import type { InboxCommand, InboxRootState } from "./store";

/**
 * Conversation queue read interface: queue order and the sorted queue view.
 * Lives with the queue lifecycle above, so query/cursors/counts and their
 * sorted projection change in one module.
 */
export const selectQuickQueueConversations = createSelector(
  [
    (state: InboxRootState) => state.inbox.queue.ids,
    (state: InboxRootState) => state.inbox.conversations,
  ],
  (ids, conversations) => ids.map((id) => conversations[id]).filter(Boolean),
);
export const selectQueueConversations = createSelector(
  [
    selectQuickQueueConversations,
    (state: InboxRootState) => state.inbox.queue.query.order,
  ],
  (conversations, order) =>
    [...conversations].sort(compareConversations(order)),
);

/**
 * Conversation queue module: owns the queue query, cursors, counts and the
 * refresh/more/retry lifecycle behind one interface. Selection and
 * history/profile loading stay in reading.ts; queue state shape stays in
 * state.ts; the read interface stays in selectors.ts.
 */
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
