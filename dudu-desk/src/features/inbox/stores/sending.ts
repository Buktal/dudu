import { DeskApiError } from "@/lib/api-response";
import { attachmentBatchRestriction } from "../attachment-rules";
import { sendRestriction, sendTarget } from "../sending-rules";
import type { InboxMessage, SendKind } from "../types";
import { selectConversation } from "./reading";
import {
  beginRequest,
  failureOf,
  releaseAttachmentResources,
} from "./requests";
import { blankDraft, type ReplySubmission } from "./sending-state";
import { inboxActions } from "./slice";
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
    const request = beginRequest(
      runtime,
      `send:${target.conversationId}`,
      getState,
    );
    dispatch(inboxActions.submissionStarted({ submission, message }));
    try {
      const response = await runtime.api.send({
        ...submission.request,
        context: request.context,
        signal: request.signal,
      });
      if (!request.current()) return;
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
        inboxActions.submissionAccepted({ messageId: message.id, response }),
      );
      const state = getState().inbox;
      if (state.submissions[message.id]?.status === "accepted")
        releaseAttachmentResources(runtime, submission.draftAttachmentIds);
      if (
        submission.next &&
        state.submissions[message.id]?.status === "accepted" &&
        state.selectionRevision === submission.selectionRevision &&
        state.replyId === target.conversationId
      ) {
        const next = state.queue.ids.find(
          (id) =>
            id !== target.conversationId &&
            state.conversations[id]?.status === "needs-reply" &&
            !sendRestriction(
              state.conversations[id],
              state.connection,
              ["text"],
              runtime.now(),
            ),
        );
        if (next) await dispatch(selectConversation(next));
        else dispatch(inboxActions.noticeChanged("没有其他可回复的待接待会话"));
      }
    } catch (error) {
      if (!request.current()) return;
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
    } finally {
      request.finish();
    }
  };
}

export function sendReply(
  conversationId: string,
  next = false,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const state = getState().inbox;
    if (state.sendingByConversation[conversationId]) return;
    const draft = state.drafts[conversationId] ?? blankDraft;
    const conversation = state.conversations[conversationId];
    const attachments = draft.attachmentIds.map((id) => state.attachments[id]);
    if (!draft.text.trim() && !attachments.length) return;
    const kinds: SendKind[] = [
      ...(draft.text.trim() ? ["text" as const] : []),
      ...attachments.filter(Boolean).map((attachment) => attachment.kind),
    ];
    const restriction =
      sendRestriction(conversation, state.connection, kinds, runtime.now()) ||
      attachmentBatchRestriction(
        conversation,
        state.connection,
        attachments.filter(Boolean),
        runtime.now(),
      );
    if (
      restriction ||
      attachments.some(
        (attachment) => attachment?.status !== "ready" || !attachment.media,
      )
    ) {
      dispatch(
        inboxActions.noticeChanged(
          restriction || "请等待附件准备完成，或移除失败附件",
        ),
      );
      return;
    }
    const clientRequestId = runtime.id();
    const media = attachments.flatMap((attachment) =>
      attachment.media ? [attachment.media] : [],
    );
    const message: InboxMessage = {
      id: `client:${clientRequestId}`,
      clientRequestId,
      conversationId,
      direction: "outgoing",
      body: media.length
        ? { type: "reply", text: draft.text, attachments: media }
        : { type: "text", text: draft.text },
      createdAt: runtime.now(),
      sequence:
        Math.max(
          0,
          ...Object.values(state.messages)
            .filter((item) => item.conversationId === conversationId)
            .map((item) => item.sequence),
        ) + 1,
      version: 0,
      delivery: { state: "sending" },
    };
    const submission: ReplySubmission = {
      request: {
        clientRequestId,
        target: sendTarget(conversation),
        text: draft.text,
        attachments: media,
      },
      messageId: message.id,
      draftRevision: draft.revision,
      textRevision: draft.textRevision,
      draftAttachmentIds: [...draft.attachmentIds],
      selectionRevision: state.selectionRevision,
      next,
      status: "sending",
    };
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
    const kinds: SendKind[] = [
      ...(text.trim() ? ["text" as const] : []),
      ...attachments.map((attachment) => attachment.kind),
    ];
    const restriction =
      sendRestriction(
        state.conversations[target.conversationId],
        state.connection,
        kinds,
        runtime.now(),
      ) ||
      attachmentBatchRestriction(
        state.conversations[target.conversationId],
        state.connection,
        attachments,
        runtime.now(),
      );
    if (restriction) {
      dispatch(inboxActions.noticeChanged(restriction));
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
  return async (dispatch, getState, runtime) => {
    const state = getState().inbox;
    if (
      !state.conversations[conversationId] ||
      state.ending[conversationId]?.status === "saving"
    )
      return;
    const request = beginRequest(runtime, `end:${conversationId}`, getState);
    dispatch(inboxActions.endStarted(conversationId));
    try {
      const conversation = await runtime.api.endConversation({
        context: request.context,
        signal: request.signal,
        conversationId,
      });
      if (request.current()) {
        if (
          conversation.id !== conversationId ||
          conversation.status !== "closed"
        )
          throw new DeskApiError(
            "invalid-response",
            "服务未确认本次接待已结束",
          );
        dispatch(inboxActions.endSucceeded(conversation));
      }
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
