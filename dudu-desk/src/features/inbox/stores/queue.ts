import { createSelector } from "@reduxjs/toolkit";
import { DeskApiError } from "@/lib/api-response";
import { compareConversations } from "../conversation-query";
import type { ConversationQuery } from "../types";
import { collectPaged } from "./page-cursor";
import { foldConversationPages } from "./queue-membership";
import {
  failedReadCursor,
  hasInFlightRequest,
  operationFailure,
  requestKeys,
  runOperation,
} from "./requests";
import { inboxActions } from "./slice";
import { connectionFromFailure } from "./state";
import {
  awaitConnectionSettled,
  type InboxCommand,
  type InboxRootState,
  notifyQueueSettled,
} from "./store";

/**
 * Conversation queue read interface: the queue has two deliberate order
 * contracts (fixed by queue-order.test) — quick cards stay in the order the
 * last load landed (server order; a stable click target for the virtualized
 * card grid), while the sidebar list re-sorts live through
 * selectQueueConversations by query.order. Lives with the queue lifecycle
 * above, so query/cursors/counts and their sorted projection change in one
 * module.
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

/**
 * 刷新重找的目标上限：刷新翻页只重找已加载成员的前若干张卡片（可见窗口），
 * 读取成本随可见量伸缩而不是随历史加载量；上限之外的旧成员不参与停页判定，
 * 由落地时的成员取代规则按服务端结果收敛。
 */
const REFRESH_REFIND_LIMIT = 100;

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
      await runOperation(runtime, requestKeys.queue, getState, async (op) => {
        // 就绪后查询：订阅在途且连接仍在 connecting 时先等 Socket ready 或失败，
        // 避免订阅与查询之间夹入的来信既收不到推送、也不在查询结果里
        if (
          getState().inbox.connection === "connecting" &&
          hasInFlightRequest(runtime, requestKeys.events)
        ) {
          await awaitConnectionSettled(runtime, op.signal);
        }
        dispatch(inboxActions.queueLoading(options.query));
        try {
          // Re-find mounted cards before pruning service-owned search
          // membership, capped at the visible window (see REFRESH_REFIND_LIMIT).
          const remainingIds = new Set(
            options.more || options.query
              ? []
              : queue.ids.slice(0, REFRESH_REFIND_LIMIT),
          );
          const loadedIds = new Set<string>();
          const { pages } = await collectPaged({
            fetch: (cursor) =>
              runtime.api.listConversations({
                context: op.context,
                signal: op.signal,
                query: options.query ?? queue.query,
                cursor,
              }),
            duplicateMessage: "会话列表返回了重复游标，请刷新后重试",
            startCursor: options.more
              ? (queue.nextCursor ?? undefined)
              : undefined,
            isCurrent: op.current,
            shouldStop: (all) => {
              const latest = all[all.length - 1];
              const previousSize = loadedIds.size;
              for (const item of latest.items) {
                loadedIds.add(item.id);
                remainingIds.delete(item.id);
              }
              if (!latest.nextCursor || !remainingIds.size) return true;
              if (loadedIds.size === previousSize)
                throw new DeskApiError(
                  "invalid-response",
                  "会话列表分页没有继续前进，请刷新后重试",
                );
              return false;
            },
          });
          if (!op.current()) return;
          const page = foldConversationPages(pages);
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
          // 失败降级经 connectionChanged 落下后没有其他回写方（queueLoaded 不回写）：
          // 重查成功即证实服务可达，把仍停在断开的连接态经同一单点恢复；
          // connecting/reconnecting 由订阅与重载流程自己收敛，不在此干预
          op.settle(() => {
            if (getState().inbox.connection === "disconnected")
              dispatch(inboxActions.connectionChanged("connected"));
          });
          const current = getState().inbox;
          if (
            !current.activeId &&
            current.selectionRevision === 0 &&
            current.queue.ids.length
          ) {
            // 启动先把首位访客设为当前接待对象，但不预取历史与资料：
            // 最近页读取按展示模式由后续实施票接通，卡片与列表共用摘要不受影响
            dispatch(inboxActions.conversationSelected(current.queue.ids[0]));
          }
        } catch (error) {
          const failure = operationFailure(error);
          op.settle(() => {
            dispatch(
              inboxActions.queueFailed({
                error: failure,
                more: !!options.more,
              }),
            );
            // 连接态降级只经 connectionChanged 单点映射（connectionFromFailure）：
            // 与队列失败前一致的类别（不可用/断网/认证失败）降级，其余失败不改变连接
            if (
              ["unavailable", "network", "authentication"].includes(
                failure.kind,
              )
            )
              dispatch(
                inboxActions.connectionChanged(connectionFromFailure(failure)),
              );
          });
        }
      });
    } finally {
      notifyQueueSettled(runtime);
    }
  };
}

export function retryConversations(): InboxCommand<Promise<void>> {
  return async (dispatch, getState) => {
    const queue = getState().inbox.queue;
    if (!queue.error || queue.status === "loading") return;
    await dispatch(loadConversations({ more: !!failedReadCursor(queue) }));
  };
}
