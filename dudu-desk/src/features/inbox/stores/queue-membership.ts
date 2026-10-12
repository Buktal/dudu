import { isQueueMember } from "../conversation-query";
import type {
  Conversation,
  ConversationPage,
  ConversationQuery,
  InboxEvent,
} from "../types";
import type { InboxState } from "./state";

/**
 * Conversation queue module: the single place that turns service pages into
 * queue state — which conversation ids survive a rewrite, when the queue must
 * be re-read, how one read's pages fold into one page and which meta a landed
 * page finalizes.
 *
 * Queue reads (refresh / append), the reconnect reload, the Live events
 * subscription and the detail thunks all answer through here, so the search
 * carve-out, the keep rules, the page fold and the meta settle change in one
 * module instead of drifting across call sites. Entity merging stays in the
 * Live events merge kernel; this module owns only the queue projection.
 */
export type QueueRewriteMode = "refresh" | "append";

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
    return incoming.has(id) || preserved.has(id);
  };
  return [
    ...new Set([...previousIds.filter(keepPrevious), ...incomingIds]),
  ].filter((id) => isQueueMember(conversations, id, query));
}

/**
 * Queue page fold: the single place that turns the pages of one queue read
 * into one page — items in page order, the last nextCursor and the newest
 * non-null total / counts / channels.
 *
 * Queue reads and the reconnect reload fold behind this seam, so a new
 * queue meta field lands in one fold instead of drifting across paging
 * callbacks. Callers keep only their own stop guards and fold the collected
 * pages after the loop; folding left over `??` reproduces an incremental
 * fold exactly.
 */
export function foldConversationPages(
  pages: ConversationPage[],
): ConversationPage {
  const page: ConversationPage = { items: [], nextCursor: null };
  for (const part of pages) {
    page.items.push(...part.items);
    page.nextCursor = part.nextCursor;
    page.total = part.total ?? page.total;
    page.counts = part.counts ?? page.counts;
    page.channels = part.channels ?? page.channels;
  }
  return page;
}

/**
 * Queue page settle: the single place that finalizes a landed page's queue
 * meta — ready status, loaded flag, cleared error and nextCursor / total /
 * counts / channels. A queue read owns the total outright; counts and
 * channels keep the last reported value when the page omits them.
 */
export function applyQueuePageMeta(
  queue: InboxState["queue"],
  page: ConversationPage,
): void {
  queue.status = "ready";
  queue.hasLoaded = true;
  queue.error = null;
  queue.nextCursor = page.nextCursor;
  queue.total = page.total;
  queue.counts = page.counts ?? queue.counts;
  queue.channels = page.channels ?? queue.channels;
}

/**
 * Whether one Live events entity should schedule a queue re-read. Search and
 * counts views can shift under any conversation / message / removal event;
 * a shared profile update only moves search hits (tags and note are searched),
 * never counts or message order, so it reloads the search view alone.
 */
export function needsQueueRefreshForEvent(
  type: InboxEvent["type"],
  query: ConversationQuery,
  counts: ConversationPage["counts"],
): boolean {
  if (type === "profile") return query.search.trim() !== "";
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
