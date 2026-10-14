import { DeskApiError } from "@/lib/api-response";
import type {
  ConnectionState,
  Conversation,
  ConversationPage,
  ConversationQuery,
  InboxEvent,
  InboxMessage,
  Page,
  PreparedAttachment,
  RequestOptions,
  SendSubmission,
  SendTarget,
  VisitorProfile,
} from "./types";

export type InboxApi = {
  dispose?: () => void;
  listConversations: (
    input: RequestOptions & { query: ConversationQuery; cursor?: string },
  ) => Promise<ConversationPage>;
  listMessages: (
    input: RequestOptions & { conversationId: string; cursor?: string },
  ) => Promise<Page<InboxMessage>>;
  readProfile: (
    input: RequestOptions & { conversationId: string },
  ) => Promise<VisitorProfile>;
  send: (input: RequestOptions & SendSubmission) => Promise<InboxMessage>;
  prepareAttachment: (
    input: RequestOptions & { target: SendTarget; file: File },
  ) => Promise<PreparedAttachment>;
  /** 需要渠道凭据的媒体素材：按消息与消息内下标经认证请求取字节。 */
  loadMessageMedia: (
    input: RequestOptions & { messageId: string; index: number },
  ) => Promise<Blob>;
  saveProfile: (
    input: RequestOptions & {
      conversationId: string;
      tags: string[];
      note: string;
    },
  ) => Promise<VisitorProfile>;
  endConversation: (
    input: RequestOptions & { conversationId: string },
  ) => Promise<Conversation>;
  resumeConversation: (
    input: RequestOptions & { conversationId: string },
  ) => Promise<Conversation>;
  subscribe: (
    input: RequestOptions & {
      onEvent: (event: InboxEvent) => void;
      onConnection: (state: ConnectionState) => void;
    },
  ) => () => void;
};

async function unavailable(): Promise<never> {
  throw new DeskApiError("unavailable", "接待服务尚未连接，当前操作暂不可用");
}

/** Production has no guessed routes or fallback data; runtime.ts always injects the real adapter, this is the not-yet-connected failure fallback. */
export const unavailableInboxApi: InboxApi = {
  listConversations: unavailable,
  listMessages: unavailable,
  readProfile: unavailable,
  send: unavailable,
  prepareAttachment: unavailable,
  loadMessageMedia: unavailable,
  saveProfile: unavailable,
  endConversation: unavailable,
  resumeConversation: unavailable,
  subscribe: ({ onConnection }) => {
    onConnection("unavailable");
    return () => {};
  },
};
