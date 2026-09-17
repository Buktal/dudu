import { sendRestriction } from "../sending-rules";
import { readConversationChoices } from "./choices";
import { advancePageCursor } from "./page-cursor";
import { selectConversation } from "./reading";
import { inboxActions } from "./slice";
import { emptyQuery, type ReplySubmission } from "./state";
import type { InboxCommand } from "./store";

/** Finding another visitor must never change the outcome of an accepted reply. */
export function receiveNext(
  submission: ReplySubmission,
  requestIsCurrent: () => boolean,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const conversationId = submission.request.target.conversationId;
    const canAdvance = () => {
      const state = getState().inbox;
      return (
        requestIsCurrent() &&
        state.submissions[submission.messageId]?.status === "accepted" &&
        state.selectionRevision === submission.selectionRevision &&
        state.replyId === conversationId &&
        !!state.conversations[conversationId] &&
        state.conversations[conversationId].status !== "closed" &&
        // Loading older history after a send is not a new incoming event.
        (state.events.incomingSequence[conversationId] ?? 0) <=
          submission.incomingSequence
      );
    };
    if (!canAdvance()) return;
    try {
      let cursor: string | undefined;
      const seenCursors = new Set<string>();
      do {
        const page = await dispatch(
          readConversationChoices({
            query: { ...emptyQuery, status: "needs-reply", order: "wait" },
            cursor,
            scope: `next:${submission.messageId}`,
          }),
        );
        if (!page || !canAdvance()) return;
        const next = page.items.find(
          (conversation) =>
            conversation.id !== conversationId &&
            !sendRestriction(
              conversation,
              getState().inbox.connection,
              ["text"],
              runtime.now(),
            ),
        );
        if (next) {
          await dispatch(selectConversation(next.id));
          return;
        }
        cursor = advancePageCursor(
          page.nextCursor,
          seenCursors,
          "The next-visitor cursor did not advance",
        );
      } while (cursor);
      dispatch(inboxActions.noticeChanged("没有其他可回复的待接待会话"));
    } catch {
      if (canAdvance())
        dispatch(
          inboxActions.noticeChanged(
            "回复已提交，暂时无法获取下一位，请手动选择会话",
          ),
        );
    }
  };
}
