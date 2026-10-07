import type { PayloadAction } from "@reduxjs/toolkit";
import type { ApiFailure } from "@/lib/api-response";
import type { ConversationQuery } from "../types";
import { emptyLoad, type InboxState } from "./state";

/**
 * Candidate choice reducers: own per-scope candidate membership, cursors and
 * the load lifecycle behind one shape. The read/cancel commands stay in
 * choices.ts; a cancelled scope keeps no results behind, and — unlike queue
 * reads — a failed candidate read never reports global connection state.
 */
export const choiceReducers = {
  choicesLoading(
    state: InboxState,
    action: PayloadAction<{
      scope: string;
      query: ConversationQuery;
      append: boolean;
    }>,
  ) {
    const { scope, query, append } = action.payload;
    // A continuation keeps the accumulated ids and the cursor it continues.
    if (!append || !state.choices[scope])
      state.choices[scope] = { ...emptyLoad(), ids: [], query };
    const choices = state.choices[scope];
    choices.status = "loading";
    choices.error = null;
    delete choices.failedRead;
  },
  choicesLoaded(
    state: InboxState,
    action: PayloadAction<{
      scope: string;
      ids: string[];
      nextCursor: string | null;
      append: boolean;
    }>,
  ) {
    const { scope, ids, nextCursor, append } = action.payload;
    const choices = state.choices[scope];
    if (!choices) return;
    choices.ids = append ? [...new Set([...choices.ids, ...ids])] : ids;
    choices.status = "ready";
    choices.hasLoaded = true;
    choices.nextCursor = nextCursor;
    choices.error = null;
  },
  choicesFailed(
    state: InboxState,
    action: PayloadAction<{
      scope: string;
      error: ApiFailure;
      append: boolean;
    }>,
  ) {
    const { scope, error, append } = action.payload;
    const choices = state.choices[scope];
    if (!choices) return;
    choices.status = "error";
    choices.error = error;
    choices.failedRead = append ? "more" : "refresh";
  },
  choicesCancelled(state: InboxState, action: PayloadAction<string>) {
    delete state.choices[action.payload];
  },
};
