import type {
  Conversation,
  InboxMessage,
  ReplyCapability,
  SendKind,
  VisitorProfile,
} from "./types";

/**
 * 测试夹具内核：stores 与组件测试共用的合法领域对象工厂。
 * 默认时间取固定时刻（FIXTURE_NOW）；实时钟仍由调用方注入（如 testStore 的 now）。
 */
export const FIXTURE_NOW = "2026-09-16T00:00:00Z";

export function defineConversation(
  input: Pick<Conversation, "id" | "identity"> & Partial<Conversation>,
): Conversation {
  return {
    status: "needs-reply",
    unread: 0,
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
