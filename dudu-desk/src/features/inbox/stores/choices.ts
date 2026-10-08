import { createSelector } from "@reduxjs/toolkit";
import { emptyQuery, matchesConversationFilters } from "../conversation-query";
import type { ConversationQuery } from "../types";
import {
  failedReadCursor,
  operationFailure,
  releaseRequest,
  requestKeys,
  runOperation,
} from "./requests";
import { inboxActions } from "./slice";
import type { InboxCommand, InboxRootState } from "./store";

/** The pinned-picker's candidate scope: one dialog, one read slot. */
export const pinPickerChoicesScope = "pin-picker";

/** Which candidate list a choice read serves; the ConversationQuery spelling
 *  of each view lives here, not with its callers. */
export type ChoiceView = "pinnable" | "replyable";

function choicesQuery(view: ChoiceView, search: string): ConversationQuery {
  return {
    ...emptyQuery,
    status: view === "pinnable" ? "active" : "needs-reply",
    search,
    order: "wait",
  };
}

/**
 * Candidate choice read interface: the pinned-picker's load state plus its
 * pinnable conversations. Membership excludes the primary conversation and
 * re-checks every entity against the read's query, so a conversation that
 * closed mid-flight drops out of the dialog without a re-read.
 */
export const selectPinnableChoices = createSelector(
  [
    (state: InboxRootState) => state.inbox.choices[pinPickerChoicesScope],
    (state: InboxRootState) => state.inbox.conversations,
    (state: InboxRootState) => state.inbox.activeId,
  ],
  (choices, conversations, primaryId) => {
    if (!choices)
      return {
        search: "",
        loading: true,
        error: null,
        nextCursor: null,
        candidates: [],
      };
    return {
      search: choices.query.search,
      loading: choices.status === "loading",
      error: choices.error,
      nextCursor: choices.nextCursor,
      candidates: choices.ids
        .map((id) => conversations[id])
        .filter(
          (conversation) =>
            conversation &&
            conversation.id !== primaryId &&
            matchesConversationFilters(conversation, choices.query),
        ),
    };
  },
);

/**
 * Candidate choice module: owns the independent candidate reads (the pinned
 * picker and the next-visitor search) behind one command surface. Reads
 * settle the per-scope load state — loading, ready, failed — instead of
 * returning pages or throwing; a stale read (cancelled or superseded)
 * settles silently and leaves the previous state untouched. Independent
 * candidate queries never replace the visible queue, its filters or reply
 * target. Entity merging stays in the Live events merge kernel via
 * conversationsDiscovered.
 */
export function readConversationChoices({
  view,
  search,
  cursor,
  scope,
}: {
  view: ChoiceView;
  /** Restated on a fresh read; a continuation inherits the scope's search. */
  search?: string;
  cursor?: string;
  scope: string;
}): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    // A continuation re-reads the standing list, so an unstated search
    // follows the scope's query instead of resetting to none.
    const term =
      search ??
      (cursor ? (getState().inbox.choices[scope]?.query.search ?? "") : "");
    const query = choicesQuery(view, term);
    const append = !!cursor;
    await runOperation(
      runtime,
      requestKeys.choices(scope),
      getState,
      async (op) => {
        dispatch(inboxActions.choicesLoading({ scope, query, append }));
        try {
          const page = await runtime.api.listConversations({
            query,
            cursor,
            context: op.context,
            signal: op.signal,
          });
          if (!op.current()) return;
          dispatch(inboxActions.conversationsDiscovered(page.items));
          const state = getState().inbox;
          // Same membership rule as the read interface: server results are
          // re-checked against the query so a mid-flight change drops out.
          const ids = page.items
            .map(({ id }) => id)
            .filter((id) =>
              matchesConversationFilters(state.conversations[id], query),
            );
          op.settle(() =>
            dispatch(
              inboxActions.choicesLoaded({
                scope,
                ids,
                nextCursor: page.nextCursor,
                append,
              }),
            ),
          );
        } catch (error) {
          if (!op.current()) return;
          op.settle(() =>
            dispatch(
              inboxActions.choicesFailed({
                scope,
                error: operationFailure(error),
                append,
              }),
            ),
          );
        }
      },
    );
  };
}

export function retryConversationChoices(
  scope: string,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState) => {
    const choices = getState().inbox.choices[scope];
    if (!choices?.error || choices.status === "loading") return;
    await dispatch(
      readConversationChoices({
        view: choices.query.status === "needs-reply" ? "replyable" : "pinnable",
        search: choices.query.search,
        // The loading transition keeps the cursor until the read settles.
        cursor: failedReadCursor(choices),
        scope,
      }),
    );
  };
}

/** Cancelling aborts the in-flight read and abandons the scope's results, so
 *  a reopened candidate view starts from its loading state. */
export function cancelConversationChoices(scope: string): InboxCommand {
  return (dispatch, _getState, runtime) => {
    releaseRequest(runtime, requestKeys.choices(scope));
    dispatch(inboxActions.choicesCancelled(scope));
  };
}
