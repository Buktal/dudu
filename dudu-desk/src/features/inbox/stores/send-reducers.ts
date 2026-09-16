import type { PayloadAction } from "@reduxjs/toolkit";
import type { ApiFailure } from "@/lib/api-response";
import type { Conversation, InboxMessage } from "../types";
import { mergeConversation, mergeMessage, orderMessages } from "./live-merge";
import {
  blankDraft,
  emptyLoad,
  type InboxState,
  type StartSubmission,
} from "./state";

export const sendReducers = {
  draftEdited(
    state: InboxState,
    action: PayloadAction<{ conversationId: string; text: string }>,
  ) {
    const { conversationId, text } = action.payload;
    const draft = state.drafts[conversationId] ?? {
      ...blankDraft,
      attachmentIds: [],
    };
    state.drafts[conversationId] = {
      ...draft,
      text,
      revision: draft.revision + 1,
      textRevision: draft.textRevision + 1,
    };
  },
  replyFocused(state: InboxState, action: PayloadAction<string>) {
    if (state.replyId === action.payload) return;
    state.replyId = action.payload;
    state.selectionRevision++;
  },
  submissionStarted(state: InboxState, action: PayloadAction<StartSubmission>) {
    const { submission, message } = action.payload;
    const conversationId = submission.request.target.conversationId;
    state.submissions[message.id] = submission;
    state.sendingByConversation[conversationId] = message.id;
    state.messages[message.id] = message;
    state.histories[conversationId] ??= { ...emptyLoad(), ids: [] };
    state.histories[conversationId].ids = orderMessages(state, [
      ...state.histories[conversationId].ids,
      message.id,
    ]);
    state.notice = null;
  },
  submissionAccepted(
    state: InboxState,
    action: PayloadAction<{ messageId: string; response: InboxMessage }>,
  ) {
    const { messageId, response } = action.payload;
    const submission = state.submissions[messageId];
    if (!submission) return;
    mergeMessage(state, {
      ...response,
      clientRequestId: submission.request.clientRequestId,
    });
    const conversationId = submission.request.target.conversationId;
    if (state.sendingByConversation[conversationId] === messageId)
      delete state.sendingByConversation[conversationId];
    const delivery = state.messages[messageId]?.delivery?.state;
    submission.status =
      delivery === "failed"
        ? "failed"
        : delivery === "unconfirmed"
          ? "unconfirmed"
          : "accepted";
    if (submission.status !== "accepted") return;
    const draft = state.drafts[conversationId];
    if (draft) {
      const attachmentIds = draft.attachmentIds.filter(
        (id) => !submission.draftAttachmentIds.includes(id),
      );
      const clearText = draft.textRevision === submission.textRevision;
      if (clearText || attachmentIds.length !== draft.attachmentIds.length) {
        state.drafts[conversationId] = {
          text: clearText ? "" : draft.text,
          attachmentIds,
          revision: draft.revision + 1,
          textRevision: clearText ? draft.textRevision + 1 : draft.textRevision,
        };
      }
    }
    for (const id of submission.draftAttachmentIds)
      delete state.attachments[id];
  },
  submissionFailed(
    state: InboxState,
    action: PayloadAction<{
      messageId: string;
      error: ApiFailure;
      uncertain: boolean;
    }>,
  ) {
    const { messageId, error, uncertain } = action.payload;
    const submission = state.submissions[messageId];
    if (!submission) return;
    const conversationId = submission.request.target.conversationId;
    const message = state.messages[messageId];
    const evidence = message.delivery?.state;
    if (
      evidence &&
      ["accepted", "sent", "delivered", "read", "failed"].includes(evidence)
    ) {
      submission.status = evidence === "failed" ? "failed" : "accepted";
      if (state.sendingByConversation[conversationId] === messageId)
        delete state.sendingByConversation[conversationId];
      return;
    }
    submission.status = uncertain ? "unconfirmed" : "failed";
    if (message.delivery?.state === "sending")
      message.delivery = { state: submission.status, reason: error.message };
    if (state.sendingByConversation[conversationId] === messageId)
      delete state.sendingByConversation[conversationId];
    state.notice = {
      kind: uncertain ? "unconfirmed-send" : "information",
      message: uncertain
        ? "发送结果尚未确认，请等待回执，避免重复发送。"
        : error.message,
    };
  },
  endStarted(state: InboxState, action: PayloadAction<string>) {
    state.ending[action.payload] = { status: "saving" };
  },
  endSucceeded(state: InboxState, action: PayloadAction<Conversation>) {
    mergeConversation(state, action.payload);
    state.ending[action.payload.id] = { status: "saved" };
    state.notice = { kind: "information", message: "本次接待已结束" };
  },
  resumeSucceeded(state: InboxState, action: PayloadAction<Conversation>) {
    mergeConversation(state, action.payload);
    state.ending[action.payload.id] = { status: "saved" };
    state.notice = { kind: "information", message: "已继续接待" };
  },
  endFailed(
    state: InboxState,
    action: PayloadAction<{ conversationId: string; error: ApiFailure }>,
  ) {
    state.ending[action.payload.conversationId] = {
      status: "error",
      error: action.payload.error,
    };
    state.notice = {
      kind: "information",
      message: action.payload.error.message,
    };
  },
};
