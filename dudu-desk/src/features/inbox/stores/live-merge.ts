import { matchesConversationFilters } from "../conversation-query";
import type { Conversation, InboxMessage, VisitorProfile } from "../types";
import { mediaMessageId } from "./media-reducers";
import { receiptKeys, rememberReceipt } from "./receipts";
import { type InboxState, onScreenId } from "./state";

/**
 * Live events merge kernel: the single place that knows how an incoming
 * entity lands in state — version guards, receipt-key correlation, queue
 * membership and teardown.
 *
 * Read, queue, send, detail and event reducers all write through here, so a
 * change to merge semantics lands in every universe at once. Reducer files
 * keep only their transition shells; this module owns the how.
 *
 * Queue-membership discipline: single live entities merge with
 * `updateQueue` (the default) so arrivals join/leave the visible queue
 * immediately. The bulk queue read (`queueLoaded`) passes `false` and
 * finishes with one `rewriteQueueIds` transaction instead, so ids are never
 * written twice for the same payload.
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
    onScreenId(state, conversationId)
  );
}

export function mergeConversation(
  state: InboxState,
  conversation: Conversation,
  updateQueue = true,
) {
  const previous = state.conversations[conversation.id];
  if (!previous || conversation.version > previous.version) {
    state.conversations[conversation.id] = conversation;
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

/**
 * Land one visitor profile — from a read or from a live profile frame. The
 * version guard keeps confirmed data: an older profile still marks the entry
 * ready for the panel but never rolls newer fields back. Local drafts live
 * in `profileEdits` and are deliberately untouched, so editing survives
 * another employee's save.
 */
export function mergeProfile(state: InboxState, profile: VisitorProfile): void {
  const previous = state.profiles[profile.conversationId];
  if (previous?.data && previous.data.version > profile.version) {
    previous.status = "ready";
    previous.error = null;
    return;
  }
  state.profiles[profile.conversationId] = {
    data: profile,
    status: "ready",
    error: null,
  };
}

export function mergeMessage(state: InboxState, message: InboxMessage): string {
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
  const selected = onScreenId(state, id);
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
  delete state.events.incomingSequence[id];
  const removedMessageIds = new Set<string>();
  for (const message of Object.values(state.messages)) {
    if (message.conversationId !== id) continue;
    removedMessageIds.add(message.id);
    delete state.messages[message.id];
    delete state.submissions[message.id];
  }
  for (const key of Object.keys(state.media))
    if (removedMessageIds.has(mediaMessageId(key))) delete state.media[key];
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
