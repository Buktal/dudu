import { sendRestriction } from "../reply/send-rules";
import type { Conversation } from "../types";
import { readConversationChoices } from "./choices";
import { collectPaged } from "./page-cursor";
import { selectConversation } from "./reading";
import { requestKeys } from "./requests";
import { inboxActions } from "./slice";
import type { ReplySubmission } from "./state";
import type { InboxCommand } from "./store";

/** Finding another visitor must never change the outcome of an accepted reply. */
export function receiveNext(
  submission: ReplySubmission,
  requestIsCurrent: () => boolean,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState) => {
    const conversationId = submission.request.target.conversationId;
    const scope = requestKeys.next(submission.messageId);
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
    let picked: Conversation | undefined;
    let loopFailed = false;
    try {
      await collectPaged({
        fetch: async (cursor) => {
          await dispatch(
            readConversationChoices({ view: "replyable", scope, cursor }),
          );
          // Reads settle into the scope's load state; a stale or failed read
          // ends the loop quietly instead of throwing across the interface.
          const state = getState().inbox;
          const choices = state.choices[scope];
          if (choices?.status !== "ready") return;
          return {
            nextCursor: choices.nextCursor,
            items: choices.ids
              .map((id) => state.conversations[id])
              .filter((candidate) => candidate !== undefined),
          };
        },
        duplicateMessage: "下一位访客的翻页游标未前进",
        isCurrent: canAdvance,
        shouldStop: (all) => {
          const latest = all[all.length - 1];
          picked = latest.items.find(
            (conversation) =>
              conversation.id !== conversationId &&
              !sendRestriction(conversation, getState().inbox.connection, [
                "text",
              ]),
          );
          return picked !== undefined;
        },
      });
    } catch {
      // Paged-loop protocol failures (a repeated cursor) share the read-
      // failed path below instead of surfacing as raw errors.
      loopFailed = true;
    }
    if (!canAdvance()) return;
    if (picked) {
      await dispatch(selectConversation(picked.id));
      // The per-message search is spent once an outcome is reached; the
      // scope's load state never outlives this receive-next.
      dispatch(inboxActions.choicesCancelled(scope));
      return;
    }
    const choices = getState().inbox.choices[scope];
    dispatch(
      inboxActions.noticeChanged(
        loopFailed || choices?.status === "error"
          ? "回复已提交，暂时无法获取下一位，请手动选择会话"
          : "没有其他可回复的待接待会话",
      ),
    );
    dispatch(inboxActions.choicesCancelled(scope));
  };
}
