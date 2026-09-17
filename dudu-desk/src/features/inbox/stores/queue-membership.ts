import { isQueueMember } from "../conversation-query";
import type {
  Conversation,
  ConversationPage,
  ConversationQuery,
  InboxEvent,
} from "../types";

/**
 * Conversation queue membership module: the single place that decides which
 * conversation ids survive a queue rewrite and when the queue must be re-read.
 *
 * Queue reads (refresh / append), the Live events reconciler, the Live events
 * subscription and the detail thunks all answer through here, so the search
 * carve-out and the keep rules change in one module instead of drifting
 * across six call sites. Entity merging stays in the Live events merge
 * kernel; this module owns only membership.
 */
export type QueueRewriteMode = "refresh" | "append" | "reconcile";

export function rewriteQueueIds(input: {
  conversations: Record<string, Conversation | undefined>;
  query: ConversationQuery;
  previousIds: string[];
  incomingIds: string[];
  mode: QueueRewriteMode;
  preserveIds?: string[];
}): string[] {
  const { conversations, query, previousIds, incomingIds, mode } = input;
  const incoming = new Set(incomingIds);
  const preserved = new Set(
    mode === "refresh" ? (input.preserveIds ?? []) : [],
  );
  const keepPrevious = (id: string): boolean => {
    if (mode === "append") return true;
    if (mode === "reconcile" && !query.search.trim()) return true;
    return incoming.has(id) || preserved.has(id);
  };
  return [
    ...new Set([...previousIds.filter(keepPrevious), ...incomingIds]),
  ].filter((id) => isQueueMember(conversations, id, query));
}

/**
 * Whether one Live events entity should schedule a queue re-read. Search and
 * counts views can shift under any conversation / message / removal event;
 * other event types never move the queue.
 */
export function needsQueueRefreshForEvent(
  type: InboxEvent["type"],
  query: ConversationQuery,
  counts: ConversationPage["counts"],
): boolean {
  if (type !== "conversation" && type !== "message" && type !== "removed")
    return false;
  return query.search.trim() !== "" || counts !== undefined;
}

/**
 * Whether a saved visitor profile can move its conversation under the active
 * query. Only full-text search matches on editable fields, so only a search
 * view must be re-read.
 */
export function needsQueueReloadAfterProfileSave(
  query: ConversationQuery,
): boolean {
  return query.search.trim() !== "";
}

/**
 * Whether a star change can move its conversation under the active query.
 * Only the starred view filters on it.
 */
export function needsQueueReloadAfterStarChange(
  query: ConversationQuery,
): boolean {
  return query.starred;
}
