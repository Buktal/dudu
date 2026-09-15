import { DeskApiError } from "@/lib/api-response";
import type {
  ConnectionState,
  Conversation,
  ConversationQuery,
  InboxEvent,
  InboxMessage,
  Page,
  PreparedAttachment,
  ReplyCapability,
  RequestOptions,
  SendSubmission,
  SendTarget,
  VisitorProfile,
} from "./types";

export type InboxApi = {
  dispose?: () => void;
  listConversations: (
    input: RequestOptions & { query: ConversationQuery; cursor?: string },
  ) => Promise<Page<Conversation>>;
  listMessages: (
    input: RequestOptions & { conversationId: string; cursor?: string },
  ) => Promise<Page<InboxMessage>>;
  readProfile: (
    input: RequestOptions & { conversationId: string },
  ) => Promise<VisitorProfile>;
  getCapability: (
    input: RequestOptions & { conversationId: string },
  ) => Promise<ReplyCapability>;
  send: (input: RequestOptions & SendSubmission) => Promise<InboxMessage>;
  prepareAttachment: (
    input: RequestOptions & { target: SendTarget; file: File },
  ) => Promise<PreparedAttachment>;
  markRead: (
    input: RequestOptions & { conversationId: string; throughSequence: number },
  ) => Promise<Conversation>;
  setStarred: (
    input: RequestOptions & { conversationId: string; starred: boolean },
  ) => Promise<Conversation>;
  saveProfile: (
    input: RequestOptions & {
      conversationId: string;
      tags: string[];
      note: string;
      version: number;
    },
  ) => Promise<VisitorProfile>;
  endConversation: (
    input: RequestOptions & { conversationId: string },
  ) => Promise<Conversation>;
  subscribe: (
    input: RequestOptions & {
      cursor?: string;
      onEvent: (event: InboxEvent) => void;
      onConnection: (state: ConnectionState) => void;
    },
  ) => () => void;
};

async function unavailable(): Promise<never> {
  throw new DeskApiError("unavailable", "接待服务尚未连接，当前操作暂不可用");
}

/** Production has no guessed routes or fallback data. A real adapter is injected here later. */
export const unavailableInboxApi: InboxApi = {
  listConversations: unavailable,
  listMessages: unavailable,
  readProfile: unavailable,
  getCapability: unavailable,
  send: unavailable,
  prepareAttachment: unavailable,
  markRead: unavailable,
  setStarred: unavailable,
  saveProfile: unavailable,
  endConversation: unavailable,
  subscribe: ({ onConnection }) => {
    onConnection("unavailable");
    return () => {};
  },
};
