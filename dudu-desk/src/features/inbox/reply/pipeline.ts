import type {
  ConnectionState,
  Conversation,
  InboxMessage,
  PreparedAttachment,
  SendKind,
  SendSubmission,
  SendTarget,
} from "../types";
import { attachmentBatchRestriction, attachmentKind } from "./attachment-rules";
import { sendRestriction } from "./send-rules";

/**
 * Reply-side literal shapes, structurally compatible with the store's
 * `DraftAttachment` / `StartSubmission`: the pipeline owns its own interface
 * and stays independent of the store module, while callers pass store state
 * straight through.
 */
export type ReplyFile = {
  name: string;
  size: number;
  mimeType: string;
  status?: "preparing" | "ready" | "failed";
  media?: unknown;
};

export type ReplySubmissionStart = {
  submission: {
    request: SendSubmission;
    messageId: string;
    draftRevision: number;
    textRevision: number;
    draftAttachmentIds: string[];
    selectionRevision: number;
    incomingSequence: number;
    next: boolean;
    status: "sending";
  };
  message: InboxMessage;
};

export type ReplyReadiness =
  | { sendable: true; notice: null }
  | { sendable: false; notice: string | null };

/**
 * Reply policy: the reply-allowed decision.
 * Owns kinds-derivation and the send+attachment composition, so every caller
 * answers the same question with the same clock value.
 */
export function replyRestriction(
  conversation: Conversation | undefined,
  connection: ConnectionState,
  content: {
    text: string;
    files: { name: string; size: number; mimeType: string }[];
  },
  now: string,
): string | null {
  const kinds: SendKind[] = [
    ...(content.text.trim() || !content.files.length
      ? (["text"] as const)
      : []),
    ...content.files.map((file) => attachmentKind(file.mimeType)),
  ];
  return (
    sendRestriction(conversation, connection, kinds, now) ||
    attachmentBatchRestriction(conversation, connection, content.files, now)
  );
}

/**
 * Deep module for the Reply pipeline send decision. Owns the
 * restriction + pending-attachment + empty-draft + busy composition, so the
 * Composer and the sendReply thunk answer the same question with the same
 * clock value. `now` stays a parameter: thunks pass the injected store
 * clock, UI passes a single wall-clock read per decision.
 *
 * A `null` notice with `sendable: false` is a silent block (empty draft or
 * already sending): disable without alerting. A string notice disables and
 * is shown to the agent.
 */
export function replyReadiness(input: {
  conversation: Conversation | undefined;
  connection: ConnectionState;
  text: string;
  files: ReplyFile[];
  sending: boolean;
  now: string;
}): ReplyReadiness {
  if (input.sending) return { sendable: false, notice: null };
  if (!input.text.trim() && !input.files.length)
    return { sendable: false, notice: null };
  const restriction = replyRestriction(
    input.conversation,
    input.connection,
    {
      text: input.text,
      files: input.files.map((file) => ({
        name: file.name,
        size: file.size,
        mimeType: file.mimeType,
      })),
    },
    input.now,
  );
  if (restriction) return { sendable: false, notice: restriction };
  if (
    input.files.some(
      (file) => file.status !== "ready" || file.media === undefined,
    )
  )
    return {
      sendable: false,
      notice: "请等待附件准备完成，或移除失败附件",
    };
  return { sendable: true, notice: null };
}

export type ReplySubmissionInput = {
  conversation: Conversation;
  text: string;
  draftRevision: number;
  textRevision: number;
  draftAttachmentIds: string[];
  media: PreparedAttachment[];
  maxSequence: number;
  incomingSequence: number;
  selectionRevision: number;
  clientRequestId: string;
  now: string;
  next: boolean;
};

/**
 * Build the optimistic message + submission pair for one accepted draft. Owns
 * the body shape (text vs reply), the client id correlation and the
 * at-submission watermarks, so sendReply and retryReply share one
 * construction site instead of rebuilding it at each call site.
 */
export function buildReplySubmission(
  input: ReplySubmissionInput,
): ReplySubmissionStart {
  const message: InboxMessage = {
    id: `client:${input.clientRequestId}`,
    clientRequestId: input.clientRequestId,
    conversationId: input.conversation.id,
    direction: "outgoing",
    body: input.media.length
      ? { type: "reply", text: input.text, attachments: input.media }
      : { type: "text", text: input.text },
    createdAt: input.now,
    sequence: input.maxSequence + 1,
    version: 0,
    delivery: { state: "sending" },
  };
  return {
    message,
    submission: {
      request: {
        clientRequestId: input.clientRequestId,
        target: sendTarget(input.conversation),
        text: input.text,
        attachments: input.media,
      },
      messageId: message.id,
      draftRevision: input.draftRevision,
      textRevision: input.textRevision,
      draftAttachmentIds: [...input.draftAttachmentIds],
      selectionRevision: input.selectionRevision,
      incomingSequence: input.incomingSequence,
      next: input.next,
      status: "sending",
    },
  };
}

/**
 * Conversation → SendTarget submission projection: the reply request's
 * addressing, owned next to its only construction site.
 */
export function sendTarget(conversation: Conversation): SendTarget {
  return {
    conversationId: conversation.id,
    visitorId: conversation.identity.id,
    channelId: conversation.identity.channelId,
    accountId: conversation.identity.accountId,
    externalUserId: conversation.identity.externalUserId,
  };
}
