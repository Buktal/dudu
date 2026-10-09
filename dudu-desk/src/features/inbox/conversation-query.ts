import { timestamp } from "@/lib/time";
import type { Conversation, ConversationQuery } from "./types";

/**
 * The standing queue query defaults: what a fresh workspace watches, and the
 * base every queue / choice read spreads from. The filters predicate reads
 * exactly this shape as "no filters applied".
 */
export const emptyQuery: ConversationQuery = {
  search: "",
  channelId: "all",
  status: "active",
  order: "wait",
};

/**
 * Client-side queue filters only: channel / status. Full-text
 * search stays server-side — a conversation the service returns is a search
 * match by definition, so callers must not re-apply search here. The search
 * carve-out for queue rewrites lives in the queue membership module.
 */
export function matchesConversationFilters(
  conversation: Conversation | undefined,
  query: ConversationQuery,
): boolean {
  if (!conversation) return false;
  return (
    (query.channelId === "all" ||
      query.channelId === conversation.identity.channelId) &&
    (query.status === "all" ||
      (query.status === "active"
        ? conversation.status !== "closed"
        : query.status === conversation.status))
  );
}

/**
 * Whether a query narrows beyond the standing defaults: the queue's filtered
 * empty state and the tools' clear-filters affordance answer through this one
 * predicate. Order is a presentation choice, not a filter.
 */
export function hasConversationFilters(query: ConversationQuery): boolean {
  return (
    !!query.search || query.channelId !== "all" || query.status !== "active"
  );
}

/**
 * One predicate for queue membership, shared by the queue reducers, the Live
 * events reconciler and the merge kernel. Missing conversations never belong.
 * Search is deliberately excluded (see above): server-owned membership.
 */
export function isQueueMember(
  conversations: Record<string, Conversation | undefined>,
  id: string,
  query: ConversationQuery,
): boolean {
  return matchesConversationFilters(conversations[id], query);
}

export function matchesConversationText(
  conversation: Conversation,
  search: string,
  additional: string[] = [],
): boolean {
  const term = search.trim().toLocaleLowerCase();
  if (!term) return true;
  const identity = conversation.identity;
  return [
    identity.name,
    identity.externalUserId,
    identity.accountName,
    identity.channelName,
    conversation.preview,
    ...additional,
  ].some((part) => part?.toLocaleLowerCase().includes(term));
}

export function compareConversations(order: ConversationQuery["order"]) {
  return (left: Conversation, right: Conversation): number => {
    if (order === "messages") {
      const difference = (right.messageCount ?? -1) - (left.messageCount ?? -1);
      if (difference) return difference;
    } else {
      const pending =
        Number(right.status === "needs-reply") -
        Number(left.status === "needs-reply");
      if (pending) return pending;
      if (left.status === "needs-reply") {
        const leftTime = timestamp(left.waitingSince);
        const rightTime = timestamp(right.waitingSince);
        if (leftTime !== undefined || rightTime !== undefined) {
          if (leftTime === undefined) return 1;
          if (rightTime === undefined) return -1;
          if (leftTime !== rightTime) return leftTime - rightTime;
        }
      }
    }
    return (
      (timestamp(right.updatedAt) ?? 0) - (timestamp(left.updatedAt) ?? 0) ||
      left.id.localeCompare(right.id)
    );
  };
}
