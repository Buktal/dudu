import type {
  ConnectionState,
  Conversation,
  ConversationQuery,
  InboxMessage,
  LoadState,
  VisitorProfile,
  WorkContext,
} from "../types";
import type { DetailSaveState, ProfileEdit } from "./detail-state";
import { type InboxEventState, initialInboxEventState } from "./event-state";
import type {
  DraftAttachment,
  EndState,
  ReplyDraft,
  ReplySubmission,
} from "./sending-state";

export const emptyQuery: ConversationQuery = {
  search: "",
  channelId: "all",
  status: "all",
  starred: false,
};

export function emptyLoad(): LoadState {
  return { status: "idle", error: null, nextCursor: null, hasLoaded: false };
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
    total?: number;
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
