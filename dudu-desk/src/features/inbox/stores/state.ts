import type { ApiFailure } from "@/lib/api-response";
import { emptyQuery } from "../conversation-query";
import type {
  ConnectionState,
  Conversation,
  ConversationPage,
  ConversationQuery,
  InboxMessage,
  LoadState,
  PreparedAttachment,
  SendKind,
  SendSubmission,
  VisitorProfile,
  WorkContext,
} from "../types";
import { type InboxEventState, initialInboxEventState } from "./receipts";

export function emptyLoad(): LoadState {
  return { status: "idle", error: null, nextCursor: null, hasLoaded: false };
}

type DetailSaveState = {
  status: "idle" | "saving" | "saved" | "error";
  error: ApiFailure | null;
};

type ProfileEdit = DetailSaveState & {
  tagsText: string;
  note: string;
  revision: number;
  savedRevision: number;
  baseVersion: number;
};

export type ProfileChanges = Partial<Pick<ProfileEdit, "tagsText" | "note">>;

type ReplyDraft = {
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
  media?: PreparedAttachment;
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
type EndState = {
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

/**
 * 正在显示的访客：专注选中、当前回复对象、并排固定或完整历史任一槽位。
 * 消息集合持有的判定与重连重载的目标选择共用这一份定义；待处理提醒的免打扰
 * 只看三种接待位置（专注、并排固定、卡片展开），不包含回复对象槽位。
 */
export function onScreenId(state: InboxState, conversationId: string): boolean {
  return (
    state.activeId === conversationId ||
    state.replyId === conversationId ||
    state.pinnedId === conversationId ||
    state.quickHistoryId === conversationId
  );
}

/** 消息媒体按「消息:下标」读取的状态；成功后 url 是本地对象 URL。 */
type MediaLoad = {
  status: "loading" | "ready" | "error";
  url?: string;
};

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
  /** 消息媒体字节：有公开链接的素材不在此列，由界面直连渠道读取 */
  media: Record<string, MediaLoad>;
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
    media: {},
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
