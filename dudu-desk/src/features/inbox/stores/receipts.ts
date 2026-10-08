import type { InboxMessage, ReplyCapability } from "../types";

/**
 * Live events evidence: the events-slice shape and the one policy for which
 * delivery evidence wins.
 *
 * `receiptKeys` enumerates every key a message or a receipt event can be
 * correlated under — the optimistic client key before the server id is known,
 * the server keys afterwards. `evidenceRank` orders delivery states so a
 * newer version wins first and, at equal versions, the more definite state
 * wins; `rememberReceipt` is the single merge algorithm the merge kernel, the
 * receipt event branch and reconciliation all write through, so a change to
 * evidence semantics lands in every universe at once.
 *
 * The container also carries the surrounding event-domain slots (cursor,
 * seen ids, tombstones, capability overlay, read-through progress): one shape
 * for the whole events slice, owned here because its receipts field is the
 * one this module's policy maintains.
 */

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
  incomingSequence: Record<string, number>;
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
    incomingSequence: {},
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
