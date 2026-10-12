import { matchesConversationFilters } from "../conversation-query";
import type { Conversation, InboxMessage } from "../types";
import { receiptKeys, rememberReceipt } from "./receipts";
import type { InboxState } from "./state";

/**
 * Live events merge kernel: the single place that knows how an incoming
 * entity lands in state — version guards, capability overlay, receipt-key
 * correlation, queue membership and teardown.
 *
 * Read, queue, send, detail and event reducers all write through here, so a
 * change to merge semantics lands in every universe at once. Reducer files
 * keep only their transition shells; this module owns the how.
 *
 * Queue-membership discipline: single live entities merge with
 * `updateQueue` (the default) so arrivals join/leave the visible queue
 * immediately. Bulk paths (`queueLoaded`, `conversationsReconciled`) pass
 * `false` and finish with one `rewriteQueueIds` transaction instead, so ids
 * are never written twice for the same payload.
 */
/**
 * Whether one conversation holds a message collection: its history was loaded,
 * or it is on screen (focus, reply target, parallel pin or the full-history
 * dialog). Live message events for any other conversation update the summary
 * only — never the messages map — so an unopened visitor stays a card summary
 * until its history is read on demand.
 */
export function holdsMessages(
  state: InboxState,
  conversationId: string,
): boolean {
  return (
    state.histories[conversationId]?.hasLoaded === true ||
    state.activeId === conversationId ||
    state.replyId === conversationId ||
    state.pinnedId === conversationId ||
    state.quickHistoryId === conversationId
  );
}

export function mergeConversation(
  state: InboxState,
  conversation: Conversation,
  updateQueue = true,
) {
  const removed = state.events.removed[conversation.id];
  if (removed !== undefined && conversation.version <= removed) return;
  const previous = state.conversations[conversation.id];
  if (!previous || conversation.version > previous.version) {
    const capability = state.events.capabilities[conversation.id];
    state.conversations[conversation.id] = {
      ...conversation,
      capability:
        capability && capability.version >= conversation.version
          ? capability.value
          : conversation.capability,
    };
    if (removed !== undefined) delete state.events.removed[conversation.id];
  }
  if (!updateQueue) return;
  if (
    matchesConversationFilters(
      state.conversations[conversation.id],
      state.queue.query,
    )
  ) {
    if (
      !state.queue.query.search.trim() &&
      !state.queue.ids.includes(conversation.id)
    )
      state.queue.ids.push(conversation.id);
  } else {
    state.queue.ids = state.queue.ids.filter((id) => id !== conversation.id);
  }
}

export function mergeMessage(state: InboxState, message: InboxMessage): string {
  if (state.events.removed[message.conversationId] !== undefined) return "";
  const collision = state.messages[message.id];
  if (collision && collision.conversationId !== message.conversationId)
    return "";
  const keys = receiptKeys(message);
  const matches = Object.values(state.messages).filter(
    (item) =>
      item.conversationId === message.conversationId &&
      receiptKeys(item).some((key) => keys.includes(key)),
  );
  const correlated =
    matches.find((item) => state.submissions[item.id]) ?? matches[0];
  const id = correlated?.id ?? message.id;
  const previous = matches.reduce<InboxMessage | undefined>(
    (newest, item) =>
      !newest || item.version > newest.version ? item : newest,
    undefined,
  );
  const snapshot =
    !previous || message.version > previous.version ? message : previous;
  const serverId =
    message.serverId ??
    (message.id !== id ? message.id : undefined) ??
    previous?.serverId;
  const merged: InboxMessage = {
    ...snapshot,
    id,
    ...(serverId ? { serverId } : {}),
    clientRequestId:
      message.clientRequestId ??
      correlated?.clientRequestId ??
      previous?.clientRequestId,
  };
  const evidence = rememberReceipt(
    state.events,
    message.conversationId,
    [
      ...new Set([
        ...keys,
        ...receiptKeys(merged),
        ...matches.flatMap(receiptKeys),
      ]),
    ],
    message.delivery
      ? { version: message.version, delivery: message.delivery }
      : undefined,
  );
  if (evidence) merged.delivery = evidence.delivery;
  state.messages[id] = merged;
  const submission = state.submissions[id];
  const delivery = merged.delivery?.state;
  if (submission && delivery && delivery !== "sending") {
    submission.status =
      delivery === "failed" || delivery === "unconfirmed"
        ? delivery
        : "accepted";
    if (state.sendingByConversation[message.conversationId] === id)
      delete state.sendingByConversation[message.conversationId];
  }
  for (const duplicate of matches) {
    if (duplicate.id === id) continue;
    delete state.messages[duplicate.id];
    const history = state.histories[message.conversationId];
    if (history)
      history.ids = [
        ...new Set(
          history.ids.map((item) => (item === duplicate.id ? id : item)),
        ),
      ];
  }
  const history = state.histories[message.conversationId];
  if (history) history.ids = orderMessages(state, history.ids);
  return id;
}

export function orderMessages(state: InboxState, ids: string[]): string[] {
  return [...new Set(ids)]
    .filter((id) => state.messages[id])
    .sort((a, b) => {
      const first = state.messages[a];
      const second = state.messages[b];
      return (
        first.sequence - second.sequence ||
        first.createdAt.localeCompare(second.createdAt) ||
        a.localeCompare(b)
      );
    });
}

/**
 * Tear down every slice of state owned by one conversation. Returns true when
 * a selected slot (active / reply / pinned / quick-history) was cleared, so
 * the caller can raise the reselection notice. The removed-version guard and
 * the notice itself stay with the caller.
 */
export function detachConversation(state: InboxState, id: string): boolean {
  const selected =
    state.activeId === id ||
    state.replyId === id ||
    state.pinnedId === id ||
    state.quickHistoryId === id;
  if (state.activeId === id) state.activeId = null;
  if (state.replyId === id) state.replyId = null;
  if (state.quickHistoryId === id) state.quickHistoryId = null;
  if (state.pinnedId === id) {
    state.pinnedId = null;
    state.pinCollapsed = false;
  }
  state.queue.ids = state.queue.ids.filter((item) => item !== id);
  delete state.conversations[id];
  delete state.histories[id];
  delete state.reminders[id];
  delete state.profiles[id];
  delete state.profileEdits[id];
  delete state.ending[id];
  delete state.sendingByConversation[id];
  delete state.events.readingThrough[id];
  delete state.events.incomingSequence[id];
  for (const message of Object.values(state.messages)) {
    if (message.conversationId !== id) continue;
    delete state.messages[message.id];
    delete state.submissions[message.id];
  }
  for (const attachment of Object.values(state.attachments))
    if (attachment.conversationId === id)
      delete state.attachments[attachment.id];
  const draft = state.drafts[id];
  if (draft?.attachmentIds.length) {
    draft.attachmentIds = [];
    draft.revision++;
  }
  return selected;
}
