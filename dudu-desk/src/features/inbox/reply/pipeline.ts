import type {
  ConnectionState,
  Conversation,
  InboxMessage,
  SendSubmission,
  SendTarget,
} from "../types";
import { sendRestriction } from "./send-rules";

type ReplySubmissionStart = {
  submission: {
    request: SendSubmission;
    messageId: string;
    draftRevision: number;
    textRevision: number;
    selectionRevision: number;
    incomingSequence: number;
    next: boolean;
    status: "sending";
  };
  message: InboxMessage;
};

type ReplyReadiness =
  | { sendable: true; notice: null }
  | { sendable: false; notice: string | null };

/**
 * Deep module for the Reply pipeline send decision. Owns the restriction +
 * empty-draft + busy composition, so the Composer and the sendReply thunk
 * answer the same question.
 *
 * A `null` notice with `sendable: false` is a silent block (empty draft or
 * already sending): disable without alerting. A string notice disables and
 * is shown to the agent.
 */
export function replyReadiness(input: {
  conversation: Conversation | undefined;
  connection: ConnectionState;
  text: string;
  sending: boolean;
}): ReplyReadiness {
  if (input.sending) return { sendable: false, notice: null };
  if (!input.text.trim()) return { sendable: false, notice: null };
  const restriction = sendRestriction(input.conversation, input.connection, [
    "text",
  ]);
  if (restriction) return { sendable: false, notice: restriction };
  return { sendable: true, notice: null };
}

type ReplySubmissionInput = {
  conversation: Conversation;
  text: string;
  draftRevision: number;
  textRevision: number;
  maxSequence: number;
  incomingSequence: number;
  selectionRevision: number;
  clientRequestId: string;
  now: string;
  next: boolean;
};

/**
 * Build the optimistic message + submission pair for one accepted draft. Owns
 * the text body shape, the client id correlation and the at-submission
 * watermarks, so sendReply and retryReply share one construction site instead
 * of rebuilding it at each call site.
 */
export function buildReplySubmission(
  input: ReplySubmissionInput,
): ReplySubmissionStart {
  const message: InboxMessage = {
    id: `client:${input.clientRequestId}`,
    clientRequestId: input.clientRequestId,
    conversationId: input.conversation.id,
    direction: "outgoing",
    body: { type: "text", text: input.text },
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
      },
      messageId: message.id,
      draftRevision: input.draftRevision,
      textRevision: input.textRevision,
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
