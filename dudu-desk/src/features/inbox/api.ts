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
  ReplyCapability,
  RequestOptions,
  SendSubmission,
  SendTarget,
  VisitorProfile,
} from "./types";

export type InboxApi = {
  dispose?: () => void;
  /**
   * 服务端不返回个人已读：待处理提醒（会话未读角标）由本次运行的内存态维护，
   * 标记已读只清除本地提示。真实适配器为 true；Mock 保留自身可复现的未读数据。
   */
  localUnread?: boolean;
  listConversations: (
    input: RequestOptions & { query: ConversationQuery; cursor?: string },
  ) => Promise<ConversationPage>;
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
  /** 需要渠道凭据的媒体素材：按消息与消息内下标经认证请求取字节。 */
  loadMessageMedia: (
    input: RequestOptions & { messageId: string; index: number },
  ) => Promise<Blob>;
  markRead: (
    input: RequestOptions & { conversationId: string; throughSequence: number },
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
  resumeConversation: (
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
  loadMessageMedia: unavailable,
  markRead: unavailable,
  saveProfile: unavailable,
  endConversation: unavailable,
  resumeConversation: unavailable,
  subscribe: ({ onConnection }) => {
    onConnection("unavailable");
    return () => {};
  },
};
