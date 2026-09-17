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

/**
 * The paged-list loop behind the same seam: drives fetch → advance → fold
 * until the cursor ends, the fetch goes stale, or `shouldStop` fires.
 * A repeat can span two reads (a stored nextCursor re-requested as `more`),
 * so the outgoing cursor joins the seen-set before each fetch, and the
 * duplicate check runs before folding — a repeated continuation must fail
 * even when the loaded window is already complete.
 *
 * Order note: quiet bail-outs that must win over the guard (a changed query,
 * a superseded receive-next) belong in `isCurrent`, which runs before the
 * advance. Fold-level stops run after it.
 */
export async function collectPaged<
  Page extends { nextCursor: string | null },
>(input: {
  fetch: (cursor: string | undefined) => Promise<Page | undefined>;
  duplicateMessage: string;
  /** Resume a stored continuation (queue `more`); joins the seen-set. */
  startCursor?: string;
  /** False after any fetch bails the loop quietly with pages so far. */
  isCurrent?: () => boolean;
  /** Folds the latest page; true ends the loop after it. May throw. */
  shouldStop?: (pages: Page[]) => boolean;
}): Promise<{ pages: Page[]; nextCursor: string | null }> {
  const seen = new Set<string>();
  const pages: Page[] = [];
  let cursor = input.startCursor;
  let next: string | null = null;
  do {
    if (cursor) seen.add(cursor);
    const page = await input.fetch(cursor);
    if (!page || input.isCurrent?.() === false)
      return { pages, nextCursor: next };
    cursor =
      advancePageCursor(page.nextCursor, seen, input.duplicateMessage) ??
      undefined;
    next = page.nextCursor;
    pages.push(page);
    if (input.shouldStop?.(pages)) break;
  } while (cursor);
  return { pages, nextCursor: next };
}
