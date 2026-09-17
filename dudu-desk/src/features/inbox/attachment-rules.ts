import { DeskApiError } from "@/lib/api-response";
import { sendRestriction } from "./sending-rules";
import type {
  ConnectionState,
  Conversation,
  MediaReference,
  ReplyCapability,
  SendKind,
} from "./types";

/**
 * Attachment gates: three entry points, one composition order.
 * - `attachmentRestriction` gates a single file (send capability + limits).
 * - `attachmentEntryRestriction` gates opening the picker (no file yet).
 * - `attachmentBatchRestriction` gates a whole draft; the Reply pipeline
 *   answers through here so per-file and batch decisions share one clock.
 */

export function attachmentKind(mimeType: string): Exclude<SendKind, "text"> {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  return "file";
}

export type AttachmentLimits = NonNullable<ReplyCapability["attachments"]>;

/**
 * Limits validation behind one seam: every attachment gate answers through
 * here, so the finite/maxBytes/maxCount shape changes in one module instead
 * of drifting across the single-file, entry and batch checks.
 */
export function readAttachmentLimits(
  conversation: Conversation | undefined,
): AttachmentLimits | null {
  const limits = conversation?.capability.attachments;
  if (
    !limits ||
    !Number.isFinite(limits.maxBytes) ||
    limits.maxBytes < 0 ||
    !Number.isInteger(limits.maxCount) ||
    limits.maxCount < 1
  )
    return null;
  return limits;
}

export function attachmentRestriction(
  conversation: Conversation | undefined,
  connection: ConnectionState,
  file: { name: string; size: number; mimeType: string },
  count: number,
  now: string,
): string | null {
  const restriction = sendRestriction(
    conversation,
    connection,
    [attachmentKind(file.mimeType)],
    now,
  );
  if (restriction) return restriction;
  const limits = readAttachmentLimits(conversation);
  if (!limits) return "渠道附件限制尚未确认";
  if (count > limits.maxCount)
    return `本会话最多添加 ${limits.maxCount} 个附件`;
  if (file.size > limits.maxBytes) return "附件超过本会话允许的大小";
  const mimeType = file.mimeType.toLowerCase();
  if (
    !limits.mimeTypes.some((type) => {
      const allowed = type.toLowerCase();
      return (
        allowed === "*/*" ||
        allowed === mimeType ||
        (allowed.endsWith("/*") && mimeType.startsWith(allowed.slice(0, -1)))
      );
    })
  )
    return "当前会话不支持这种文件格式";
  return null;
}

export function attachmentEntryRestriction(
  conversation: Conversation | undefined,
  connection: ConnectionState,
  count: number,
  now: string,
): string | null {
  const restriction = sendRestriction(conversation, connection, [], now);
  if (restriction) return restriction;
  if (!conversation?.capability.kinds.some((kind) => kind !== "text"))
    return "当前会话仅支持文字回复";
  const limits = readAttachmentLimits(conversation);
  if (!limits) return "渠道附件限制尚未确认";
  if (!limits.mimeTypes.length) return "当前会话暂未开放附件格式";
  if (count >= limits.maxCount)
    return `本会话最多添加 ${limits.maxCount} 个附件`;
  return null;
}

export function attachmentAccept(
  capability: ReplyCapability | undefined,
): string {
  return (
    capability?.attachments?.mimeTypes
      .filter(
        (mime) =>
          mime === "*/*" || capability.kinds.includes(attachmentKind(mime)),
      )
      .join(",") ?? ""
  );
}

export function attachmentBatchRestriction(
  conversation: Conversation | undefined,
  connection: ConnectionState,
  files: { name: string; size: number; mimeType: string }[],
  now: string,
): string | null {
  for (const file of files) {
    const restriction = attachmentRestriction(
      conversation,
      connection,
      file,
      files.length,
      now,
    );
    if (restriction) return restriction;
  }
  return null;
}

export function readPreparedAttachment(
  value: unknown,
  kind: MediaReference["kind"],
): MediaReference {
  if (!value || typeof value !== "object")
    throw new DeskApiError("invalid-response", "服务未返回有效的附件资源");
  const media = value as Record<string, unknown>;
  if (
    typeof media.id !== "string" ||
    !media.id.trim() ||
    media.kind !== kind ||
    typeof media.name !== "string" ||
    !media.name.trim() ||
    typeof media.mimeType !== "string" ||
    !media.mimeType.includes("/") ||
    typeof media.size !== "number" ||
    !Number.isFinite(media.size) ||
    media.size < 0 ||
    (media.url !== undefined && typeof media.url !== "string")
  ) {
    throw new DeskApiError("invalid-response", "服务未返回有效的附件资源");
  }
  return {
    id: media.id,
    kind,
    name: media.name,
    mimeType: media.mimeType,
    size: media.size,
    ...(typeof media.url === "string" ? { url: media.url } : {}),
  };
}
