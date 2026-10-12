import type { ApiFailure } from "@/lib/api-response";
import { emptyQuery } from "../conversation-query";
import type {
  ConnectionState,
  Conversation,
  ConversationPage,
  ConversationQuery,
  InboxMessage,
  LoadState,
  MediaReference,
  SendKind,
  SendSubmission,
  VisitorProfile,
  WorkContext,
} from "../types";
import { type InboxEventState, initialInboxEventState } from "./receipts";

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
  histories: Record<
    string,
    LoadState & { ids: string[]; failedRead?: "refresh" | "more" }
  >;
  choices: Record<
    string,
    LoadState & {
      ids: string[];
      query: ConversationQuery;
      failedRead?: "refresh" | "more";
    }
  >;
  profiles: Record<
    string,
    {
      status: LoadState["status"];
      error: LoadState["error"];
      data?: VisitorProfile;
    }
  >;
  profileEdits: Record<string, ProfileEdit>;
  drafts: Record<string, ReplyDraft>;
  attachments: Record<string, DraftAttachment>;
  submissions: Record<string, ReplySubmission>;
  /** 待处理提醒：真实链路在本次运行维护的未读计数，键存在即提示（见 reminders.ts） */
  reminders: Record<string, number>;
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
    choices: {},
    profiles: {},
    profileEdits: {},
    drafts: {},
    attachments: {},
    submissions: {},
    reminders: {},
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
