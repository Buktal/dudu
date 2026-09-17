import { DeskApiError } from "@/lib/api-response";

/**
 * Conversation queue paged-list adapter: the single place that advances a
 * continuation cursor and rejects a repeated one.
 *
 * Queue reads, the Live events reconciler and receive-next all page behind
 * this seam, so the duplicate-cursor guard changes in one module instead of
 * drifting across three call sites. Callers pass their own message so the
 * user-facing copy keeps its context.
 */
export function advancePageCursor(
  cursor: string | null,
  seen: Set<string>,
  message: string,
): string | undefined {
  if (!cursor) return;
  if (seen.has(cursor)) throw new DeskApiError("invalid-response", message);
  seen.add(cursor);
  return cursor;
}
