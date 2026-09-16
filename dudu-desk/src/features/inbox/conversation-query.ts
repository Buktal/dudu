import { timestamp } from "@/lib/time";
import type { Conversation, ConversationQuery } from "./types";

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
        : query.status === conversation.status)) &&
    (!query.starred || conversation.starred)
  );
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
