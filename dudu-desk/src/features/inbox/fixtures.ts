import type { Conversation, InboxMessage, VisitorProfile } from "./types";

/**
 * FixtureBuilder module: one place that knows what a valid Conversation
 * looks like. Both the seeded development world (mocks.ts) and the hand-built
 * test world (stores/test-support.ts) build through here, so a new required
 * field or invariant lands in both universes at once.
 *
 * Defaults are frozen instants; live clocks stay injected by the caller
 * (testStore `now`, development driver `now`).
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

export function defineMessage(
  input: Pick<InboxMessage, "id" | "conversationId"> & Partial<InboxMessage>,
): InboxMessage {
  return {
    direction: "incoming",
    body: { type: "text", text: "请帮我确认一下" },
    createdAt: "2026-09-16T00:00:00Z",
    sequence: 1,
    version: 1,
    ...input,
  };
}

export function defineProfile(
  input: Pick<VisitorProfile, "conversationId"> & Partial<VisitorProfile>,
): VisitorProfile {
  return {
    version: 1,
    fields: [],
    tags: [],
    note: "",
    ...input,
  };
}
