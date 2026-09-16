import type { ApiFailure } from "@/lib/api-response";
import type {
  ConnectionState,
  Conversation,
  ConversationPage,
  ConversationQuery,
  InboxMessage,
  LoadState,
  MediaReference,
  ReplyCapability,
  SendKind,
  SendSubmission,
  VisitorProfile,
  WorkContext,
} from "../types";

export const emptyQuery: ConversationQuery = {
  search: "",
  channelId: "all",
  status: "active",
  starred: false,
  order: "wait",
};

export function emptyLoad(): LoadState {
  return { status: "idle", error: null, nextCursor: null, hasLoaded: false };
}

export type DetailSaveState = {
  status: "idle" | "saving" | "saved" | "error";
  error: ApiFailure | null;
};

export type ProfileEdit = DetailSaveState & {
  tagsText: string;
  note: string;
  revision: number;
  savedRevision: number;
  baseVersion: number;
};

export type ProfileChanges = Partial<Pick<ProfileEdit, "tagsText" | "note">>;

export type ReplyDraft = {
  text: string;
  attachmentIds: string[];
  revision: number;
  textRevision: number;
};
export type DraftAttachment = {
  id: string;
  conversationId: string;
  kind: Exclude<SendKind, "text">;
  name: string;
  mimeType: string;
  size: number;
  status: "preparing" | "ready" | "failed";
  media?: MediaReference;
  error?: string;
  previewUrl?: string;
};
export type ReplySubmission = {
  request: SendSubmission;
  messageId: string;
  draftRevision: number;
  textRevision: number;
  draftAttachmentIds: string[];
  selectionRevision: number;
  incomingSequence: number;
  next: boolean;
  status: "sending" | "accepted" | "failed" | "unconfirmed";
};
export type EndState = {
  status: "saving" | "saved" | "error";
  error?: ApiFailure;
};
export const blankDraft: ReplyDraft = {
  text: "",
  attachmentIds: [],
  revision: 0,
  textRevision: 0,
};
export type StartSubmission = {
  submission: ReplySubmission;
  message: InboxMessage;
};

export function latestIncomingSequence(
  messages: Record<string, InboxMessage>,
  conversationId: string,
) {
  return Object.values(messages).reduce(
    (latest, message) =>
      message.conversationId === conversationId &&
      message.direction === "incoming"
        ? Math.max(latest, message.sequence)
        : latest,
    0,
  );
}

export type ReceiptEvidence = {
  version: number;
  delivery: NonNullable<InboxMessage["delivery"]>;
};

export type InboxEventState = {
  cursor: string | null;
  seenIds: string[];
  removed: Record<string, number>;
  capabilities: Record<string, { version: number; value: ReplyCapability }>;
  receipts: Record<string, Record<string, ReceiptEvidence>>;
  readThrough: Record<string, number>;
  readingThrough: Record<string, number>;
  incomingSequence: Record<string, number>;
};

export function initialInboxEventState(): InboxEventState {
  return {
    cursor: null,
    seenIds: [],
    removed: {},
    capabilities: {},
    receipts: {},
    readThrough: {},
    readingThrough: {},
    incomingSequence: {},
  };
}

export function receiptKeys(message: {
  id?: string;
  serverId?: string;
  clientRequestId?: string;
}): string[] {
  return [
    ...new Set([
      ...(message.id ? [`message:${message.id}`] : []),
      ...(message.serverId ? [`message:${message.serverId}`] : []),
      ...(message.clientRequestId ? [`client:${message.clientRequestId}`] : []),
    ]),
  ];
}

const evidenceRank = {
  sending: 0,
  unconfirmed: 1,
  accepted: 2,
  sent: 3,
  failed: 4,
  delivered: 5,
  read: 6,
};

/** Message snapshots and receipts share server versions; local uncertainty has no newer evidence. */
export function rememberReceipt(
  events: InboxEventState,
  conversationId: string,
  keys: string[],
  evidence?: ReceiptEvidence,
): ReceiptEvidence | undefined {
  if (!keys.length) return;
  events.receipts[conversationId] ??= {};
  const receipts = events.receipts[conversationId];
  let newest = evidence;
  for (const key of keys) {
    const previous = receipts[key];
    if (
      previous &&
      (!newest ||
        previous.version > newest.version ||
        (previous.version === newest.version &&
          evidenceRank[previous.delivery.state] >
            evidenceRank[newest.delivery.state]))
    )
      newest = previous;
  }
  if (newest) for (const key of keys) receipts[key] = newest;
  return newest;
}

export type InboxState = {
  context: WorkContext;
  generation: number;
  connection: ConnectionState;
  events: InboxEventState;
  conversations: Record<string, Conversation>;
  messages: Record<string, InboxMessage>;
  queue: LoadState & {
    ids: string[];
    query: ConversationQuery;
    failedRead?: "refresh" | "more";
    total?: number;
    counts?: ConversationPage["counts"];
    channels?: ConversationPage["channels"];
  };
  histories: Record<string, LoadState & { ids: string[] }>;
  profiles: Record<
    string,
    {
      status: LoadState["status"];
      error: LoadState["error"];
      data?: VisitorProfile;
    }
  >;
  profileEdits: Record<string, ProfileEdit>;
  starUpdates: Record<string, DetailSaveState>;
  drafts: Record<string, ReplyDraft>;
  attachments: Record<string, DraftAttachment>;
  submissions: Record<string, ReplySubmission>;
  sendingByConversation: Record<string, string>;
  ending: Record<string, EndState>;
  activeId: string | null;
  replyId: string | null;
  pinnedId: string | null;
  pinCollapsed: boolean;
  quickHistoryId: string | null;
  selectionRevision: number;
  notice: {
    kind: "information" | "unconfirmed-send";
    message: string;
  } | null;
};

export function initialInboxState(
  context: WorkContext,
  generation = 0,
): InboxState {
  return {
    context,
    generation,
    connection: "connecting",
    events: initialInboxEventState(),
    conversations: {},
    messages: {},
    queue: { ...emptyLoad(), ids: [], query: { ...emptyQuery } },
    histories: {},
    profiles: {},
    profileEdits: {},
    starUpdates: {},
    drafts: {},
    attachments: {},
    submissions: {},
    sendingByConversation: {},
    ending: {},
    activeId: null,
    replyId: null,
    pinnedId: null,
    pinCollapsed: false,
    quickHistoryId: null,
    selectionRevision: 0,
    notice: null,
  };
}
