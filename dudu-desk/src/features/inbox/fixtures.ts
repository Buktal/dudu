import type { Conversation } from "./types";

/**
 * FixtureBuilder module: one place that knows what a valid Conversation
 * looks like. Both the seeded development world (mocks.ts) and the hand-built
 * test world (stores/test-support.ts) build through here, so a new required
 * field or invariant lands in both universes at once.
 */
export function defineConversation(
  input: Pick<Conversation, "id" | "identity"> & Partial<Conversation>,
): Conversation {
  return {
    status: "needs-reply",
    unread: 0,
    starred: false,
    preview: "",
    updatedAt: "2026-09-16T00:00:00Z",
    version: 1,
    capability: { state: "allowed", kinds: ["text"] },
    ...input,
  };
}
