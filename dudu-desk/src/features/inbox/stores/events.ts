import { DeskApiError } from "@/lib/api-response";
import type { Conversation, InboxEvent, InboxMessage, Page } from "../types";
import { receiptKeys } from "./event-state";
import {
  beginRequest,
  failureOf,
  releaseAttachmentResources,
} from "./requests";
import { inboxActions } from "./slice";
import type { InboxCommand } from "./store";

function connectInbox(reconnecting: boolean): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    runtime.unsubscribe?.();
    runtime.requests.get("recovery")?.abort();
    const request = beginRequest(runtime, "events", getState);
    const controller = runtime.requests.get("events");
    let needsRecovery =
      reconnecting ||
      ["disconnected", "unavailable"].includes(getState().inbox.connection);
    let recovery: Promise<void> | undefined;
    dispatch(
      inboxActions.connectionChanged(
        reconnecting ? "reconnecting" : "connecting",
      ),
    );
    try {
      const unsubscribe = runtime.api.subscribe({
        context: request.context,
        signal: request.signal,
        cursor: getState().inbox.events.cursor ?? undefined,
        onEvent: (event) => {
          if (request.current()) dispatch(receiveInboxEvent(event));
        },
        onConnection: (connection) => {
          if (!request.current()) return;
          if (connection === "connected") {
            if (recovery) return;
            if (
              needsRecovery ||
              getState().inbox.connection === "disconnected"
            ) {
              needsRecovery = false;
              const task = dispatch(reconcileInbox(request.current));
              recovery = task;
              void task.finally(() => {
                if (recovery === task) recovery = undefined;
              });
            } else dispatch(inboxActions.connectionChanged("connected"));
          } else {
            needsRecovery = true;
            runtime.requests.get("recovery")?.abort();
            recovery = undefined;
            dispatch(inboxActions.connectionChanged(connection));
          }
        },
      });
      if (!request.current()) {
        unsubscribe();
        return;
      }
      let stopped = false;
      const stop = () => {
        if (stopped) return;
        stopped = true;
        controller?.abort();
        runtime.requests.get("recovery")?.abort();
        request.finish();
        unsubscribe();
        if (runtime.unsubscribe === stop) runtime.unsubscribe = undefined;
      };
      runtime.unsubscribe = stop;
      await recovery;
    } catch (error) {
      const current = request.current();
      controller?.abort();
      request.finish();
      if (current)
        dispatch(
          inboxActions.connectionChanged(
            failureOf(error).kind === "unavailable"
              ? "unavailable"
              : "disconnected",
          ),
        );
    }
  };
}

export function startInboxUpdates(): InboxCommand<Promise<void>> {
  return connectInbox(false);
}

export function reconnectInbox(): InboxCommand<Promise<void>> {
  return connectInbox(true);
}

function receiveInboxEvent(event: InboxEvent): InboxCommand {
  return (dispatch, getState, runtime) => {
    const previous = getState().inbox;
    dispatch(inboxActions.eventReceived(event));
    const state = getState().inbox;
    if (state === previous) return;
    if (
      event.type === "removed" &&
      !state.conversations[event.conversationId] &&
      state.events.removed[event.conversationId] === event.version
    ) {
      const id = event.conversationId;
      for (const prefix of [
        "history",
        "profile",
        "profile-save",
        "send",
        "read",
        "star",
        "end",
      ]) {
        const key = `${prefix}:${id}`;
        runtime.requests.get(key)?.abort();
        runtime.requests.delete(key);
      }
      releaseAttachmentResources(
        runtime,
        Object.values(previous.attachments)
          .filter((attachment) => attachment.conversationId === id)
          .map((attachment) => attachment.id),
      );
    }
    if (event.type === "message" || event.type === "receipt")
      dispatch(settleConfirmedReplies());
  };
}

function settleConfirmedReplies(): InboxCommand {
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

export function markConversationRead(
  conversationId: string,
  throughSequence: number,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const state = getState().inbox;
    if (
      !state.conversations[conversationId] ||
      state.connection !== "connected" ||
      !Number.isSafeInteger(throughSequence) ||
      throughSequence <= 0 ||
      throughSequence <=
        Math.max(
          state.events.readThrough[conversationId] ?? 0,
          state.events.readingThrough[conversationId] ?? 0,
        )
    )
      return;
    const request = beginRequest(runtime, `read:${conversationId}`, getState);
    dispatch(inboxActions.readStarted({ conversationId, throughSequence }));
    try {
      const conversation = await runtime.api.markRead({
        context: request.context,
        signal: request.signal,
        conversationId,
        throughSequence,
      });
      if (!request.current() || !getState().inbox.conversations[conversationId])
        return;
      if (conversation.id !== conversationId)
        throw new DeskApiError("invalid-response", "已读确认未关联到当前会话");
      dispatch(inboxActions.readConfirmed({ conversation, throughSequence }));
    } catch (error) {
      if (request.current())
        dispatch(
          inboxActions.readFailed({ conversationId, error: failureOf(error) }),
        );
    } finally {
      request.finish();
    }
  };
}

function reconcileInbox(
  sourceCurrent: () => boolean,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const request = beginRequest(runtime, "recovery", getState);
    const controller = runtime.requests.get("recovery");
    const current = () => request.current() && sourceCurrent();
    const query = getState().inbox.queue.query;
    dispatch(inboxActions.connectionChanged("reconnecting"));
    try {
      let cursor: string | undefined;
      const seenCursors = new Set<string>();
      const queuePage: Page<Conversation> = { items: [], nextCursor: null };
      do {
        const page = await runtime.api.listConversations({
          context: request.context,
          signal: request.signal,
          query,
          cursor,
        });
        if (!current()) return;
        if (getState().inbox.queue.query !== query) break;
        queuePage.items.push(...page.items);
        queuePage.nextCursor = page.nextCursor;
        queuePage.total = page.total ?? queuePage.total;
        cursor = nextCursor(page.nextCursor, seenCursors);
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
        const historyPage: Page<InboxMessage> = { items: [], nextCursor: null };
        do {
          const page = await runtime.api.listMessages({
            context: request.context,
            signal: request.signal,
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
          historyCursor = nextCursor(page.nextCursor, cursors);
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
            context: request.context,
            signal: request.signal,
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
          inboxActions.connectionChanged(
            failure.kind === "unavailable" ? "unavailable" : "disconnected",
          ),
        );
        dispatch(inboxActions.noticeChanged(failure.message));
      }
      controller?.abort();
    } finally {
      request.finish();
    }
  };
}

function nextCursor(
  cursor: string | null,
  seen: Set<string>,
): string | undefined {
  if (!cursor) return;
  if (seen.has(cursor))
    throw new DeskApiError(
      "invalid-response",
      "恢复读取返回了重复游标，请重新连接",
    );
  seen.add(cursor);
  return cursor;
}
