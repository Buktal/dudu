import { DeskApiError } from "@/lib/api-response";
import { beginRequest, failureOf } from "./requests";
import { inboxActions } from "./slice";
import type { InboxCommand } from "./store";

export function endReception(
  conversationId: string,
): InboxCommand<Promise<void>> {
  return changeReception(conversationId, "end");
}

export function resumeReception(
  conversationId: string,
): InboxCommand<Promise<void>> {
  return changeReception(conversationId, "resume");
}

function changeReception(
  conversationId: string,
  action: "end" | "resume",
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const state = getState().inbox;
    const current = state.conversations[conversationId];
    if (
      !current ||
      state.ending[conversationId]?.status === "saving" ||
      (action === "end" && current.status === "closed") ||
      (action === "resume" && current.status !== "closed")
    )
      return;
    const request = beginRequest(runtime, `end:${conversationId}`, getState);
    dispatch(inboxActions.endStarted(conversationId));
    try {
      const operation =
        action === "end" ? "endConversation" : "resumeConversation";
      const conversation = await runtime.api[operation]({
        context: request.context,
        signal: request.signal,
        conversationId,
      });
      if (!request.current()) return;
      const latest = getState().inbox.conversations[conversationId];
      const confirmedStatuses =
        action === "end" ? ["closed"] : ["needs-reply", "waiting"];
      if (
        conversation.id !== conversationId ||
        !confirmedStatuses.includes(conversation.status) ||
        (latest &&
          latest.version >= conversation.version &&
          !confirmedStatuses.includes(latest.status))
      )
        throw new DeskApiError(
          "invalid-response",
          action === "end"
            ? "服务未确认本次接待已结束"
            : "服务未确认本次接待已恢复",
        );
      dispatch(
        action === "end"
          ? inboxActions.endSucceeded(conversation)
          : inboxActions.resumeSucceeded(conversation),
      );
    } catch (error) {
      if (request.current())
        dispatch(
          inboxActions.endFailed({ conversationId, error: failureOf(error) }),
        );
    } finally {
      request.finish();
    }
  };
}
