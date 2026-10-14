import { mediaKindOfMime } from "../message-content";
import type { ConnectionState, Conversation, SendKind } from "../types";
import { sendRestriction } from "./send-rules";

/**
 * Attachment gates on the text-only contract: the server only declares
 * allowed+["text"] or restricted+reason, so both gates answer through
 * `sendRestriction` and the entry gate adds the text-only explanation.
 * Attachment limits belong to the server-side attachment contract and come
 * back here when that contract exists.
 */

/**
 * Mime → 媒体 kind 映射由 `../message-content` 深 module 拥有，
 * 这里只保留 Reply pipeline 侧的调用签名并委托，避免同形分派漂移。
 */
export function attachmentKind(mimeType: string): Exclude<SendKind, "text"> {
  return mediaKindOfMime(mimeType);
}

export function attachmentRestriction(
  conversation: Conversation | undefined,
  connection: ConnectionState,
  file: { name: string; size: number; mimeType: string },
): string | null {
  return sendRestriction(conversation, connection, [
    attachmentKind(file.mimeType),
  ]);
}

export function attachmentEntryRestriction(
  conversation: Conversation | undefined,
  connection: ConnectionState,
): string | null {
  const restriction = sendRestriction(conversation, connection, []);
  if (restriction) return restriction;
  if (!conversation?.capability.kinds.some((kind) => kind !== "text"))
    return "当前会话仅支持文字回复";
  return null;
}
