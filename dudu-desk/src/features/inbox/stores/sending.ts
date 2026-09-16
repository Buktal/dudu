import { DeskApiError } from "@/lib/api-response";
import { buildReplySubmission, replyReadiness } from "../reply-pipeline";
import type { InboxMessage } from "../types";
import { receiveNext } from "./next-reception";
import {
  failureOf,
  releaseAttachmentResources,
  runOperation,
} from "./requests";
import { inboxActions } from "./slice";
import {
  blankDraft,
  latestIncomingSequence,
  type ReplySubmission,
} from "./state";
import type { InboxCommand } from "./store";

export function editDraft(conversationId: string, text: string): InboxCommand {
  return (dispatch, getState) => {
    if (getState().inbox.conversations[conversationId])
      dispatch(inboxActions.draftEdited({ conversationId, text }));
  };
}

export function focusReply(conversationId: string): InboxCommand {
  return (dispatch, getState) => {
    if (getState().inbox.conversations[conversationId])
      dispatch(inboxActions.replyFocused(conversationId));
  };
}

function deliver(
  submission: ReplySubmission,
  message: InboxMessage,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const { target } = submission.request;
    await runOperation(
      runtime,
      `send:${target.conversationId}`,
      getState,
      async (op) => {
        dispatch(inboxActions.submissionStarted({ submission, message }));
        try {
          const response = await runtime.api.send({
            ...submission.request,
            context: op.context,
            signal: op.signal,
          });
          if (!op.current()) return;
          if (
            response.conversationId !== target.conversationId ||
            response.direction !== "outgoing" ||
            !response.delivery ||
            !["accepted", "sent", "delivered", "read"].includes(
              response.delivery.state,
            ) ||
            (response.clientRequestId &&
              response.clientRequestId !== submission.request.clientRequestId)
          ) {
            throw new DeskApiError(
              "invalid-response",
              "服务未返回可确认的发送结果",
            );
          }
          dispatch(
            inboxActions.submissionAccepted({
              messageId: message.id,
              response,
            }),
          );
          const state = getState().inbox;
          if (state.submissions[message.id]?.status === "accepted")
            releaseAttachmentResources(runtime, submission.draftAttachmentIds);
          if (submission.next)
            await dispatch(receiveNext(submission, op.current));
        } catch (error) {
          if (!op.current()) return;
          const failure = failureOf(error);
          dispatch(
            inboxActions.submissionFailed({
              messageId: message.id,
              error: failure,
              uncertain: ["network", "invalid-response", "aborted"].includes(
                failure.kind,
              ),
            }),
          );
        }
      },
    );
  };
}

export function sendReply(
  conversationId: string,
  next = false,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const state = getState().inbox;
    const draft = state.drafts[conversationId] ?? blankDraft;
    const conversation = state.conversations[conversationId];
    const attachments = draft.attachmentIds.map((id) => state.attachments[id]);
    // One clock value per decision: the pipeline owns the
    // restriction + pending + empty + busy composition.
    const readiness = replyReadiness({
      conversation,
      connection: state.connection,
      text: draft.text,
      files: attachments.filter(Boolean),
      sending: !!state.sendingByConversation[conversationId],
      now: runtime.now(),
    });
    if (!readiness.sendable) {
      if (readiness.notice)
        dispatch(inboxActions.noticeChanged(readiness.notice));
      return;
    }
    const clientRequestId = runtime.id();
    const media = attachments.flatMap((attachment) =>
      attachment.media ? [attachment.media] : [],
    );
    // Compare events with what was known at submission, even if history arrives first.
    const { submission, message } = buildReplySubmission({
      conversation,
      text: draft.text,
      draftRevision: draft.revision,
      textRevision: draft.textRevision,
      draftAttachmentIds: [...draft.attachmentIds],
      media,
      maxSequence: Math.max(
        0,
        ...Object.values(state.messages)
          .filter((item) => item.conversationId === conversationId)
          .map((item) => item.sequence),
      ),
      incomingSequence: Math.max(
        state.events.incomingSequence[conversationId] ?? 0,
        latestIncomingSequence(state.messages, conversationId),
      ),
      selectionRevision: state.selectionRevision,
      clientRequestId,
      now: runtime.now(),
      next,
    });
    await dispatch(deliver(submission, message));
  };
}

export function retryReply(messageId: string): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const state = getState().inbox;
    const original = state.submissions[messageId];
    if (
      original?.status !== "failed" ||
      state.sendingByConversation[original.request.target.conversationId]
    )
      return;
    const { target, attachments, text } = original.request;
    const readiness = replyReadiness({
      conversation: state.conversations[target.conversationId],
      connection: state.connection,
      text,
      files: attachments.map((media) => ({
        name: media.name,
        size: media.size,
        mimeType: media.mimeType,
        status: "ready" as const,
        media,
      })),
      sending: false,
      now: runtime.now(),
    });
    if (!readiness.sendable) {
      if (readiness.notice)
        dispatch(inboxActions.noticeChanged(readiness.notice));
      return;
    }
    await dispatch(
      deliver(
        { ...original, status: "sending", next: false },
        { ...state.messages[messageId], delivery: { state: "sending" } },
      ),
    );
  };
}

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
    await runOperation(
      runtime,
      `end:${conversationId}`,
      getState,
      async (op) => {
        dispatch(inboxActions.endStarted(conversationId));
        try {
          const operation =
            action === "end" ? "endConversation" : "resumeConversation";
          const conversation = await runtime.api[operation]({
            context: op.context,
            signal: op.signal,
            conversationId,
          });
          if (!op.current()) return;
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
          op.settle(() =>
            dispatch(
              inboxActions.endFailed({
                conversationId,
                error: failureOf(error),
              }),
            ),
          );
        }
      },
    );
  };
}
