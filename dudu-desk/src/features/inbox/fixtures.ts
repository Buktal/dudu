import type {
  Conversation,
  InboxMessage,
  ReplyCapability,
  SendKind,
  VisitorProfile,
} from "./types";

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

/**
 * Test-world card: the paired conversations the store suites share. Litmus
 * (name, preview, unread) lives here, so the two cards cannot drift apart by
 * editing only one of them.
 */
export function defineTestConversation(
  input: Pick<Conversation, "id" | "identity"> & Partial<Conversation>,
): Conversation {
  return defineConversation({
    status: "needs-reply",
    unread: 1,
    preview: "你好，想问一下",
    ...input,
  });
}

export function allowedCapability(
  kinds: SendKind[],
  attachments?: ReplyCapability["attachments"],
): ReplyCapability {
  return {
    state: "allowed",
    kinds,
    ...(attachments ? { attachments } : {}),
  };
}

export function restrictedCapability(
  reason: string,
  nextStep: string,
): ReplyCapability {
  return { state: "restricted", kinds: [], reason, nextStep };
}

export function unknownCapability(
  reason: string,
  nextStep: string,
): ReplyCapability {
  return { state: "unknown", kinds: [], reason, nextStep };
}
