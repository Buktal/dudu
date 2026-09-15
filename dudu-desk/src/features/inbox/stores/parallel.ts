import { ensureConversationLoaded } from "./reading";
import { focusReply } from "./sending";
import { inboxActions } from "./slice";
import type { InboxCommand } from "./store";

export type ReceptionPane = "primary" | "pinned";

export function enterParallel(): InboxCommand<Promise<void>> {
  return async (dispatch, getState) => {
    dispatch(inboxActions.parallelEntered());
    const { replyId } = getState().inbox;
    if (replyId) await dispatch(ensureConversationLoaded(replyId));
  };
}

export function pinConversation(
  conversationId: string,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState) => {
    const conversation = getState().inbox.conversations[conversationId];
    if (!conversation || conversation.status === "closed") {
      dispatch(
        inboxActions.noticeChanged(
          "这段会话已结束或不可用，请选择其他会话固定",
        ),
      );
      return;
    }
    dispatch(inboxActions.conversationPinned(conversationId));
    await dispatch(ensureConversationLoaded(conversationId));
  };
}

export function focusPane(pane: ReceptionPane): InboxCommand {
  return (dispatch, getState) => {
    const state = getState().inbox;
    const id = pane === "primary" ? state.activeId : state.pinnedId;
    if (!id || !state.conversations[id]) {
      dispatch(
        inboxActions.noticeChanged(
          pane === "primary"
            ? "请先从会话列表选择主接待"
            : "请先固定一段会话，再切换到右窗",
        ),
      );
      return;
    }
    if (pane === "pinned" && state.pinCollapsed) void dispatch(restorePinned());
    else dispatch(focusReply(id));
  };
}

export function collapsePinned(): InboxCommand {
  return (dispatch) => {
    dispatch(inboxActions.pinnedCollapsed());
  };
}

export function restorePinned(): InboxCommand<Promise<void>> {
  return async (dispatch, getState) => {
    const state = getState().inbox;
    const id = state.pinnedId;
    if (!id || !state.conversations[id]) {
      dispatch(
        inboxActions.noticeChanged("固定会话已不可用，请重新选择一段会话"),
      );
      return;
    }
    dispatch(inboxActions.pinnedRestored());
    await dispatch(ensureConversationLoaded(id));
  };
}

export function unpinConversation(): InboxCommand {
  return (dispatch) => {
    dispatch(inboxActions.pinnedReleased());
  };
}
