import { attachmentBatchRestriction, attachmentKind } from "./attachment-rules";
import { sendRestriction } from "./sending-rules";
import type { ConnectionState, Conversation, SendKind } from "./types";

export type ReplyContent = {
  text: string;
  files: { name: string; size: number; mimeType: string }[];
};

/**
 * Deep module for the reply-allowed decision. Owns kinds-derivation and the
 * send+attachment composition, so every caller answers the same question with
 * the same clock value. `now` stays a parameter: thunks pass the injected
 * store clock, UI passes a single wall-clock read per decision.
 */
export function replyRestriction(
  conversation: Conversation | undefined,
  connection: ConnectionState,
  content: ReplyContent,
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
