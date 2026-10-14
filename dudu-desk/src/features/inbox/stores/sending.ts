import { buildReplySubmission, replyReadiness } from "../reply/pipeline";
import type { DeliveryState, InboxMessage } from "../types";
import { receiveNext } from "./next-reception";
import {
  releaseAttachmentResources,
  runConversationOperation,
} from "./requests";
import { inboxActions } from "./slice";
import {
  blankDraft,
  type InboxState,
  latestIncomingSequence,
  type ReplySubmission,
} from "./state";
import type { InboxCommand, InboxDispatch, InboxRuntime } from "./store";

/**
 * 历史重试（本地提交缺失，重登或他端加载的失败消息）不占用草稿：用永不可能与草稿
 * 修订相等的哨兵值，让结果结算匹配不到当前草稿，重试不会清掉后来写下的正文或附件。
 */
const NO_DRAFT_MATCH = -1;

/**
 * 发送结果结算：已接受而尚未落定的提交，按合并后的消息结果结算——草稿仍是提交时的
 * 修订就把结果落到提交并释放附件，否则视为已被后续编辑取代，直接释放附件。
 * 实时来信、receipt 报文与其他端的发送结果都经此单点，重连重载合并同一消息结果后
 * 也调用同一函数，结果判定不因来源而分叉。
 */
export function settleConfirmedReplies(): InboxCommand {
  return (dispatch, getState, runtime) => {
    for (const submission of Object.values(getState().inbox.submissions)) {
      if (submission.status !== "accepted") continue;
      const state = getState().inbox;
      const draft = state.drafts[submission.request.target.conversationId];
      const response = state.messages[submission.messageId];
      if (!response) continue;
      if (
        draft &&
        (draft.textRevision === submission.textRevision ||
          draft.attachmentIds.some((id) =>
            submission.draftAttachmentIds.includes(id),
          ))
      ) {
        acceptSubmission(dispatch, runtime, submission, response);
      } else {
        releaseAttachmentResources(runtime, submission.draftAttachmentIds);
      }
    }
    const state = getState().inbox;
    if (
      state.notice?.kind === "unconfirmed-send" &&
      !Object.values(state.submissions).some(
        (item) => item.status === "unconfirmed",
      )
    )
      dispatch(inboxActions.noticeChanged(null));
  };
}

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

/**
 * Accepted-settlement seam: an accepted send means exactly this — record the
 * server response on the submission and release its draft attachments. Both
 * the send lifecycle (deliver below) and the Live events merge settle through
 * here, so accepted-means-cleaned-up lives in one module instead of drifting
 * across send / merge writers.
 */
export function acceptSubmission(
  dispatch: InboxDispatch,
  runtime: InboxRuntime,
  submission: ReplySubmission,
  response: InboxMessage,
) {
  dispatch(
    inboxActions.submissionAccepted({
      messageId: submission.messageId,
      response,
    }),
  );
  releaseAttachmentResources(runtime, submission.draftAttachmentIds);
}

/**
 * Submission watermarks, owned next to their only consumers: the highest
 * sequence known locally (the optimistic bubble sits next) and the latest
 * incoming sequence seen through events or history (the reply baseline).
 */
function watermarks(state: InboxState, conversationId: string) {
  const messages = Object.values(state.messages).filter(
    (item) => item.conversationId === conversationId,
  );
  return {
    maxSequence: Math.max(0, ...messages.map((item) => item.sequence)),
    incomingSequence: Math.max(
      state.events.incomingSequence[conversationId] ?? 0,
      latestIncomingSequence(state.messages, conversationId),
    ),
  };
}

/**
 * 可确认的发送结果：契约第 4 节三态（真实适配器只能返回这三种，其余取值在
 * http-inbox-contract 的解析边界按无效响应拒绝）。列表中的其余取值属 store
 * 既有事件模型的兼容词表，真实报文经解析边界不会出现。
 */
const CONFIRMABLE_DELIVERY_STATES: DeliveryState[] = [
  "sending",
  "sent",
  "failed",
  "accepted",
  "delivered",
  "read",
  "unconfirmed",
];

function deliver(
  submission: ReplySubmission,
  message: InboxMessage,
): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const { target } = submission.request;
    await runConversationOperation(
      runtime,
      getState,
      target.conversationId,
      "send",
      {
        loading: () =>
          dispatch(inboxActions.submissionStarted({ submission, message })),
        call: (io) => runtime.api.send({ ...submission.request, ...io }),
        validate: (response) =>
          response.conversationId !== target.conversationId ||
          response.direction !== "outgoing" ||
          !response.delivery ||
          // 渠道失败也是已保存的持久消息：同样是合法结果，按失败气泡显示
          !CONFIRMABLE_DELIVERY_STATES.includes(response.delivery.state) ||
          (response.clientRequestId &&
            response.clientRequestId !== submission.request.clientRequestId)
            ? "服务未返回可确认的发送结果"
            : undefined,
        loaded: async (response, op) => {
          acceptSubmission(dispatch, runtime, submission, response);
          if (submission.next)
            await dispatch(receiveNext(submission, op.current));
        },
        failed: (failure) =>
          dispatch(
            inboxActions.submissionFailed({
              messageId: message.id,
              error: failure,
              uncertain: ["network", "invalid-response", "aborted"].includes(
                failure.kind,
              ),
            }),
          ),
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
    // One decision per accepted reply: the pipeline owns the
    // restriction + pending + empty + busy composition.
    const readiness = replyReadiness({
      conversation,
      connection: state.connection,
      text: draft.text,
      files: attachments.filter(Boolean),
      sending: !!state.sendingByConversation[conversationId],
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
      ...watermarks(state, conversationId),
      selectionRevision: state.selectionRevision,
      clientRequestId,
      now: runtime.now(),
      next,
    });
    await dispatch(deliver(submission, message));
  };
}

/**
 * Manual retry of a definite failure: the same visitor and text go out again as
 * a new message with a fresh clientRequestId, while the persisted failure stays
 * in the timeline as its own record. Reusing the original request id would
 * overwrite the failed row instead of resending.
 *
 * A failure loaded from history (re-login or another端加载) has no local
 * submission; the message itself carries the visitor and the text, so the retry
 * addresses the same conversation and body. The retry never touches the draft:
 * sentinel revisions keep the settlement from clearing text written later.
 */
export function retryReply(messageId: string): InboxCommand<Promise<void>> {
  return async (dispatch, getState, runtime) => {
    const state = getState().inbox;
    const original = state.submissions[messageId];
    const message = state.messages[messageId];
    // 重试正文同时是可否重试的单点判别：有本地提交时按失败状态决定，正文取提交里的；
    // 无本地提交（重登/他端加载的历史消息）时仅 outgoing + failed + 文本成立——真实
    // 链路的 outgoing 失败必为文本（服务端拒绝非文本发送），非文本的历史失败不进入重试。
    const text = original
      ? original.status === "failed"
        ? original.request.text
        : undefined
      : message?.direction === "outgoing" &&
          message.delivery?.state === "failed" &&
          message.body.type === "text"
        ? message.body.text
        : undefined;
    const conversationId = original
      ? original.request.target.conversationId
      : message?.conversationId;
    const conversation = conversationId
      ? state.conversations[conversationId]
      : undefined;
    if (
      text === undefined ||
      !conversation ||
      state.sendingByConversation[conversation.id]
    )
      return;
    // 本地提交缺失（历史加载的失败消息）时从消息自身取原访客与正文，草稿不参与
    const attachments = original ? original.request.attachments : [];
    const readiness = replyReadiness({
      conversation,
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
    });
    if (!readiness.sendable) {
      if (readiness.notice)
        dispatch(inboxActions.noticeChanged(readiness.notice));
      return;
    }
    const { submission, message: bubble } = buildReplySubmission({
      conversation,
      text,
      // 历史重试不占用草稿：哨兵修订值让结算永不匹配当前草稿
      draftRevision: original?.draftRevision ?? NO_DRAFT_MATCH,
      textRevision: original?.textRevision ?? NO_DRAFT_MATCH,
      draftAttachmentIds: original ? [...original.draftAttachmentIds] : [],
      media: attachments,
      ...watermarks(state, conversation.id),
      selectionRevision: state.selectionRevision,
      clientRequestId: runtime.id(),
      now: runtime.now(),
      next: false,
    });
    await dispatch(deliver(submission, bubble));
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
    await runConversationOperation(runtime, getState, conversationId, "end", {
      loading: () => dispatch(inboxActions.endStarted(conversationId)),
      call: (io) => {
        const operation =
          action === "end" ? "endConversation" : "resumeConversation";
        return runtime.api[operation]({ ...io, conversationId });
      },
      validate: (conversation) => {
        const confirmedStatuses =
          action === "end" ? ["closed"] : ["needs-reply", "waiting"];
        const latest = getState().inbox.conversations[conversationId];
        if (
          conversation.id !== conversationId ||
          !confirmedStatuses.includes(conversation.status) ||
          (latest &&
            latest.version >= conversation.version &&
            !confirmedStatuses.includes(latest.status))
        )
          return action === "end"
            ? "服务未确认本次接待已结束"
            : "服务未确认本次接待已恢复";
        return undefined;
      },
      loaded: (conversation) => {
        dispatch(
          action === "end"
            ? inboxActions.endSucceeded(conversation)
            : inboxActions.resumeSucceeded(conversation),
        );
      },
      failed: (failure) =>
        dispatch(inboxActions.endFailed({ conversationId, error: failure })),
    });
  };
}
