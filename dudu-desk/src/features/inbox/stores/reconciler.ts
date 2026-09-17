import type { ApiFailure } from "@/lib/api-response";
import type {
  ConnectionState,
  ConversationPage,
  InboxMessage,
  Page,
} from "../types";
import { advancePageCursor } from "./page-cursor";
import {
  failureOf,
  releaseAttachmentResources,
  runOperation,
} from "./requests";
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
        dispatch(
          inboxActions.submissionAccepted({
            messageId: submission.messageId,
            response,
          }),
        );
      }
      releaseAttachmentResources(runtime, submission.draftAttachmentIds);
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
    await runOperation(runtime, "recovery", getState, async (op) => {
      const controller = runtime.requests.get("recovery");
      const current = () => op.current() && sourceCurrent();
      const query = getState().inbox.queue.query;
      dispatch(inboxActions.connectionChanged("reconnecting"));
      try {
        let cursor: string | undefined;
        const seenCursors = new Set<string>();
        const queuePage: ConversationPage = { items: [], nextCursor: null };
        do {
          const page = await runtime.api.listConversations({
            context: op.context,
            signal: op.signal,
            query,
            cursor,
          });
          if (!current()) return;
          if (getState().inbox.queue.query !== query) break;
          queuePage.items.push(...page.items);
          queuePage.nextCursor = page.nextCursor;
          queuePage.total = page.total ?? queuePage.total;
          queuePage.counts = page.counts ?? queuePage.counts;
          queuePage.channels = page.channels ?? queuePage.channels;
          cursor = advancePageCursor(
            page.nextCursor,
            seenCursors,
            "恢复读取返回了重复游标，请重新连接",
          );
        } while (cursor);
        if (getState().inbox.queue.query === query)
          dispatch(inboxActions.conversationsReconciled(queuePage));

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
          const cursors = new Set<string>();
          let historyCursor: string | undefined;
          const historyPage: Page<InboxMessage> = {
            items: [],
            nextCursor: null,
          };
          do {
            const page = await runtime.api.listMessages({
              context: op.context,
              signal: op.signal,
              conversationId,
              cursor: historyCursor,
            });
            if (!current() || !getState().inbox.conversations[conversationId])
              return;
            historyPage.items.push(...page.items);
            historyPage.nextCursor = page.nextCursor;
            if (
              page.items.some((message) =>
                receiptKeys(message).some((key) => known.has(key)),
              )
            )
              break;
            historyCursor = advancePageCursor(
              page.nextCursor,
              cursors,
              "恢复读取返回了重复游标，请重新连接",
            );
          } while (historyCursor);
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
          const failure = failureOf(error);
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
