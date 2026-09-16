import { replyRestriction } from "./reply-policy";
import type { ConnectionState, Conversation } from "./types";

export { composerIntent } from "./sending-rules";

export type ReplyFile = {
  name: string;
  size: number;
  mimeType: string;
  status?: "preparing" | "ready" | "failed";
  media?: unknown;
};

export type ReplyReadiness =
  | { sendable: true; notice: null }
  | { sendable: false; notice: string | null };

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
