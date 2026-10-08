import { DeskApiError } from "@/lib/api-response";
import type { MediaReference } from "../types";

/**
 * prepareAttachment response validation: unknown payload → MediaReference.
 * The trust boundary between the transport response and the draft store:
 * any shape drift throws DeskApiError instead of entering the draft state.
 */
export function parsePreparedAttachment(
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
