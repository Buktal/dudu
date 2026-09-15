import type {
  Conversation,
  ConversationQuery,
  InboxMessage,
  ReplyCapability,
} from "../types";

export type ReceiptEvidence = {
  version: number;
  delivery: NonNullable<InboxMessage["delivery"]>;
};

export type InboxEventState = {
  cursor: string | null;
  seenIds: string[];
  removed: Record<string, number>;
  capabilities: Record<string, { version: number; value: ReplyCapability }>;
  receipts: Record<string, Record<string, ReceiptEvidence>>;
  readThrough: Record<string, number>;
  readingThrough: Record<string, number>;
};

export function initialInboxEventState(): InboxEventState {
  return {
    cursor: null,
    seenIds: [],
    removed: {},
    capabilities: {},
    receipts: {},
    readThrough: {},
    readingThrough: {},
  };
}

export function receiptKeys(message: {
  id?: string;
  serverId?: string;
  clientRequestId?: string;
}): string[] {
  return [
    ...new Set([
      ...(message.id ? [`message:${message.id}`] : []),
      ...(message.serverId ? [`message:${message.serverId}`] : []),
      ...(message.clientRequestId ? [`client:${message.clientRequestId}`] : []),
    ]),
  ];
}

const evidenceRank = {
  sending: 0,
  unconfirmed: 1,
  accepted: 2,
  sent: 3,
  failed: 4,
  delivered: 5,
  read: 6,
};

/** Message snapshots and receipts share server versions; local uncertainty has no newer evidence. */
export function rememberReceipt(
  events: InboxEventState,
  conversationId: string,
  keys: string[],
  evidence?: ReceiptEvidence,
): ReceiptEvidence | undefined {
  if (!keys.length) return;
  events.receipts[conversationId] ??= {};
  const receipts = events.receipts[conversationId];
  let newest = evidence;
  for (const key of keys) {
    const previous = receipts[key];
    if (
      previous &&
      (!newest ||
        previous.version > newest.version ||
        (previous.version === newest.version &&
          evidenceRank[previous.delivery.state] >
            evidenceRank[newest.delivery.state]))
    )
      newest = previous;
  }
  if (newest) for (const key of keys) receipts[key] = newest;
  return newest;
}

export function matchesConversationQuery(
  conversation: Conversation | undefined,
  query: ConversationQuery,
): boolean {
  if (!conversation) return false;
  const { identity } = conversation;
  const term = query.search.trim().toLocaleLowerCase();
  return (
    (query.channelId === "all" || query.channelId === identity.channelId) &&
    (query.status === "all" || query.status === conversation.status) &&
    (!query.starred || conversation.starred) &&
    (!term ||
      [
        identity.name,
        identity.externalUserId,
        identity.accountName,
        conversation.preview,
      ].some((part) => part?.toLocaleLowerCase().includes(term)))
  );
}
