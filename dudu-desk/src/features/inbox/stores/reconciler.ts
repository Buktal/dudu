import type { ApiFailure } from "@/lib/api-response";
import type { ConnectionState, InboxMessage, Page } from "../types";
import { collectPaged } from "./page-cursor";
import { foldConversationPages } from "./queue-membership";
import {
  getRequestScope,
  operationFailure,
  releaseAttachmentResources,
  requestKeys,
  runOperation,
} from "./requests";
import { acceptSubmission } from "./sending";
import { inboxActions } from "./slice";
import { receiptKeys } from "./state";
import type { InboxCommand } from "./store";

/** Failure kinds map to connection states in exactly one place. */
export function connectionFromFailure(failure: ApiFailure): ConnectionState {
  return failure.kind === "unavailable" ? "unavailable" : "disconnected";
}

export function settleConfirmedReplies(): InboxCommand {
  return (dispatch, getState, runtime) => {
    for (const submission of Object.values(getState().inbox.submissions)) {
      if (submission.status !== "accepted") continue;
      const state = getState().inbox;
      const draft = state.drafts[submission.request.target.conversationId];
      const response = state.messages[submission.messageId];
      if (!response) continue;
      if (
        draft &&
        (draft.textRevision === submission.textRevision ||
          draft.attachmentIds.some((id) =>
            submission.draftAttachmentIds.includes(id),
          ))
      ) {
        acceptSubmission(dispatch, runtime, submission, response);
      } else {
        releaseAttachmentResources(runtime, submission.draftAttachmentIds);
      }
    }
    const state = getState().inbox;
    if (
      state.notice?.kind === "unconfirmed-send" &&
      !Object.values(state.submissions).some(
        (item) => item.status === "unconfirmed",
      )
    )
      dispatch(inboxActions.noticeChanged(null));
  };
}

/**
 * Deep module for post-(re)connect recovery. Owns cursor-dedup, receipt
 * ranking and the queue/history/capability fan-out behind one interface; the
 * connection lifecycle in events.ts only decides *when* to reconcile.
 */
export function reconcileInbox(
  sourceCurrent: () => boolean,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    await runOperation(runtime, requestKeys.recovery, getState, async (op) => {
      const controller = getRequestScope(runtime, requestKeys.recovery);
      const current = () => op.current() && sourceCurrent();
      const query = getState().inbox.queue.query;
      dispatch(inboxActions.connectionChanged("reconnecting"));
      try {
        // Recovery must see every page: the loop never stops early.
        const { pages } = await collectPaged({
          fetch: (cursor) =>
            runtime.api.listConversations({
              context: op.context,
              signal: op.signal,
              query,
              cursor,
            }),
          duplicateMessage: "恢复读取返回了重复游标，请重新连接",
          isCurrent: () => current() && getState().inbox.queue.query === query,
        });
        if (!current()) return;
        if (getState().inbox.queue.query === query)
          dispatch(
            inboxActions.conversationsReconciled(foldConversationPages(pages)),
          );

        const historyIds = Object.keys(getState().inbox.histories).filter(
          (id) => getState().inbox.conversations[id],
        );
        const histories = historyIds.map(async (conversationId) => {
          const previous = getState().inbox.histories[conversationId];
          const known = new Set(
            previous.ids.flatMap((id) => {
              const message = getState().inbox.messages[id];
              return message ? receiptKeys(message) : [];
            }),
          );
          const historyPage: Page<InboxMessage> = {
            items: [],
            nextCursor: null,
          };
          await collectPaged({
            fetch: (historyCursor) =>
              runtime.api.listMessages({
                context: op.context,
                signal: op.signal,
                conversationId,
                cursor: historyCursor,
              }),
            duplicateMessage: "恢复读取返回了重复游标，请重新连接",
            isCurrent: () =>
              current() && !!getState().inbox.conversations[conversationId],
            shouldStop: (all) => {
              const latest = all[all.length - 1];
              historyPage.items.push(...latest.items);
              historyPage.nextCursor = latest.nextCursor;
              return latest.items.some((message) =>
                receiptKeys(message).some((key) => known.has(key)),
              );
            },
          });
          if (!current() || !getState().inbox.conversations[conversationId])
            return;
          dispatch(
            inboxActions.historyReconciled({
              conversationId,
              page: historyPage,
              preserveCursor:
                previous.hasLoaded ||
                getState().inbox.histories[conversationId]?.hasLoaded,
            }),
          );
          dispatch(settleConfirmedReplies());
        });
        const capabilities = Object.keys(getState().inbox.conversations).map(
          async (conversationId) => {
            const expectedVersion =
              getState().inbox.conversations[conversationId].version;
            const expectedCapabilityVersion =
              getState().inbox.events.capabilities[conversationId]?.version ??
              null;
            const capability = await runtime.api.getCapability({
              context: op.context,
              signal: op.signal,
              conversationId,
            });
            if (current())
              dispatch(
                inboxActions.capabilityRefreshed({
                  conversationId,
                  capability,
                  expectedVersion,
                  expectedCapabilityVersion,
                }),
              );
          },
        );
        await Promise.all([...histories, ...capabilities]);
        if (current()) dispatch(inboxActions.connectionChanged("connected"));
      } catch (error) {
        if (current()) {
          const failure = operationFailure(error);
          dispatch(
            inboxActions.connectionChanged(connectionFromFailure(failure)),
          );
          dispatch(inboxActions.noticeChanged(failure.message));
        }
        controller?.abort();
      }
    });
  };
}
