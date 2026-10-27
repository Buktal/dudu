import type { ApiFailure } from "@/lib/api-response";
import { emptyQuery } from "../conversation-query";
import type {
  ConnectionState,
  Conversation,
  ConversationPage,
  ConversationQuery,
  InboxMessage,
  LoadState,
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
  revision: number;
  textRevision: number;
};
export type ReplySubmission = {
  request: SendSubmission;
  messageId: string;
  draftRevision: number;
  textRevision: number;
  selectionRevision: number;
  incomingSequence: number;
  next: boolean;
  status: "sending" | "accepted" | "failed" | "unconfirmed";
  /** 已按接受结果完成草稿清理：结算扫描不再进入（见 sending.ts）。 */
  settled?: boolean;
};
type EndState = {
  status: "saving" | "error";
  error?: ApiFailure;
};
export const blankDraft: ReplyDraft = {
  text: "",
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

/** Failure kinds map to connection states in exactly one place. */
export function connectionFromFailure(failure: ApiFailure): ConnectionState {
  return failure.kind === "unavailable" ? "unavailable" : "disconnected";
}

/**
 * 会话正被显示：专注选中、当前回复对象、并排固定或完整历史任一槽位。
 * 消息集合持有的判定与重连重载的目标选择共用这一份定义；待处理提醒的免打扰
 * 是更窄的判定（reminders.ts 的 inReceptionPosition，只看三种接待位置，不含回复对象）。
 */
export function displaysConversation(
  state: InboxState,
  conversationId: string,
): boolean {
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
    /** 查询变化的重读在途：落地时旧成员整体让位服务端顺序 */
    pendingRewrite?: boolean;
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
