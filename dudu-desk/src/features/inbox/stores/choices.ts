import { matchesConversationFilters } from "../conversation-query";
import type { Conversation, ConversationQuery, Page } from "../types";
import { releaseRequest, requestKeys, runOperation } from "./requests";
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
    return runOperation(
      runtime,
      requestKeys.choices(scope),
      getState,
      async (op) => {
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
          return {
            ...page,
            items: page.items
              .map(({ id }) => state.conversations[id])
              .filter((item) => matchesConversationFilters(item, query)),
          };
        } catch (error) {
          if (op.current()) throw error;
        }
      },
    );
  };
}

export function cancelConversationChoices(scope = "picker"): InboxCommand {
  return (_dispatch, _getState, runtime) => {
    releaseRequest(runtime, requestKeys.choices(scope));
  };
}
