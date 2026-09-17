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
 * Defaults are frozen instants (`FIXTURE_NOW`); live clocks stay injected by
 * the caller (testStore `now`, development driver `now`). Only dev/test
 * modules import this kernel — production never does.
 */
export const FIXTURE_NOW = "2026-09-16T00:00:00Z";

export function defineConversation(
  input: Pick<Conversation, "id" | "identity"> & Partial<Conversation>,
): Conversation {
  return {
    status: "needs-reply",
    unread: 0,
    starred: false,
    preview: "",
    updatedAt: FIXTURE_NOW,
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
    createdAt: FIXTURE_NOW,
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
