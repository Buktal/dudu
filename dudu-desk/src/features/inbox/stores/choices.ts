import { matchesConversationFilters } from "../conversation-query";
import type { Conversation, ConversationQuery, Page } from "../types";
import { beginRequest } from "./requests";
import { inboxActions } from "./slice";
import type { InboxCommand } from "./store";

/** Independent candidate queries never replace the visible queue, its filters or reply target. */
export function readConversationChoices({
  query,
  cursor,
  scope = "picker",
}: {
  query: ConversationQuery;
  cursor?: string;
  scope?: string;
}): InboxCommand<Promise<Page<Conversation> | undefined>> {
  return async (dispatch, getState, runtime) => {
    const request = beginRequest(runtime, `choices:${scope}`, getState);
    try {
      const page = await runtime.api.listConversations({
        query,
        cursor,
        context: request.context,
        signal: request.signal,
      });
      if (!request.current()) return;
      dispatch(inboxActions.conversationsDiscovered(page.items));
      const state = getState().inbox;
      return {
        ...page,
        items: page.items
          .map(({ id }) => state.conversations[id])
          .filter((item) => matchesConversationFilters(item, query)),
      };
    } catch (error) {
      if (request.current()) throw error;
    } finally {
      request.finish();
    }
  };
}

export function cancelConversationChoices(scope = "picker"): InboxCommand {
  return (_dispatch, _getState, runtime) => {
    const key = `choices:${scope}`;
    runtime.requests.get(key)?.abort();
    runtime.requests.delete(key);
  };
}
