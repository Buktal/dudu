import { ensureConversationLoaded } from "./reading";
import { focusReply } from "./sending";
import { inboxActions } from "./slice";
import type { InboxCommand } from "./store";

export function openQuickHistory(
  conversationId: string,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState) => {
    const state = getState().inbox;
    if (!state.conversations[conversationId]) return;
    dispatch(focusReply(conversationId));
    dispatch(inboxActions.quickHistoryChanged(conversationId));
    await dispatch(ensureConversationLoaded(conversationId));
  };
}

export function closeQuickHistory(): InboxCommand {
  return (dispatch) => {
    dispatch(inboxActions.quickHistoryChanged(null));
  };
}
