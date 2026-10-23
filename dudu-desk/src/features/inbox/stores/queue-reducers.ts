import type { PayloadAction } from "@reduxjs/toolkit";
import type { ApiFailure } from "@/lib/api-response";
import { sameConversationQuery } from "../conversation-query";
import type {
  Conversation,
  ConversationPage,
  ConversationQuery,
} from "../types";
import { mergeConversation } from "./live-merge";
import { applyQueuePageMeta, rewriteQueueIds } from "./queue-membership";
import type { InboxState } from "./state";

/**
 * Conversation queue reducers: own queue membership, cursors and counts.
 * Entity merging stays in the Live events merge kernel; the keep rules for a
 * rewrite and the fold / settle of a landed page stay in the queue module.
 */
export const queueReducers = {
  conversationsDiscovered(
    state: InboxState,
    action: PayloadAction<Conversation[]>,
  ) {
    for (const conversation of action.payload)
      mergeConversation(state, conversation, false);
  },
  queueLoading(
    state: InboxState,
    action: PayloadAction<ConversationQuery | undefined>,
  ) {
    if (action.payload) {
      // 查询变化的重读保留已加载相位（ids 与 hasLoaded）：列表不回退首读
      // 占位；标记待整体重写，落地时旧成员与顺序让位服务端结果
      if (!sameConversationQuery(state.queue.query, action.payload))
        state.queue.pendingRewrite = true;
      state.queue.nextCursor = null;
      state.queue.query = action.payload;
      state.queue.total = undefined;
    }
    state.queue.status = "loading";
    state.queue.error = null;
    delete state.queue.failedRead;
  },
  queueLoaded(
    state: InboxState,
    action: PayloadAction<{
      page: ConversationPage;
      append: boolean;
      preserveIds: string[];
    }>,
  ) {
    const { page, append, preserveIds } = action.payload;
    // 查询变化的重读落地：服务端成员与顺序整体取代旧列表（换搜索后旧
    // 成员不因 live 版本更新混入新结果）；同查询刷新仍走位置稳定的保留规则
    const rewrite = !!state.queue.pendingRewrite;
    const previousIds = rewrite ? [] : [...state.queue.ids];
    // Merge entities without touching queue membership: the single rewrite
    // below owns ids, so the merge kernel must not push/prune mid-flight.
    for (const conversation of page.items)
      mergeConversation(state, conversation, false);
    state.queue.ids = rewriteQueueIds({
      conversations: state.conversations,
      query: state.queue.query,
      previousIds,
      incomingIds: page.items.map((item) => item.id),
      mode: append ? "append" : "refresh",
      preserveIds: rewrite ? [] : preserveIds,
    });
    delete state.queue.pendingRewrite;
    applyQueuePageMeta(state.queue, page);
  },
  queueFailed(
    state: InboxState,
    action: PayloadAction<{ error: ApiFailure; more: boolean }>,
  ) {
    const { error, more } = action.payload;
    state.queue.status = "error";
    state.queue.error = error;
    state.queue.failedRead = more ? "more" : "refresh";
  },
};
