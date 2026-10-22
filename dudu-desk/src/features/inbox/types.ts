import type { ApiFailure } from "@/lib/api-response";

export type WorkContext = { agentId: string; workspaceId: string };
type RequestState = "idle" | "loading" | "ready" | "error";
export type ConversationStatus = "needs-reply" | "waiting" | "closed";
export type SendKind = "text" | "image" | "file" | "audio" | "video";

export type VisitorIdentity = {
  id: string;
  externalUserId: string;
  name?: string;
  avatarUrl?: string;
  channelId: string;
  channelName: string;
  accountId: string;
  accountName: string;
};

/** 服务端真实产出：可发 allowed+["text"]，受限 restricted+空 kinds+原因文案。 */
export type ReplyCapability = {
  state: "allowed" | "restricted";
  kinds: SendKind[];
  reason?: string;
};

export type Conversation = {
  id: string;
  identity: VisitorIdentity;
  status: ConversationStatus;
  preview: string;
  updatedAt: string;
  waitingSince?: string;
  messageCount?: number;
  version: number;
  capability: ReplyCapability;
};

export type ProfileField =
  | { state: "available"; value: string }
  | { state: "not-provided" | "empty" };

export type VisitorProfile = {
  conversationId: string;
  version: number;
  fields: { label: string; value: ProfileField }[];
  tags: string[];
  note: string;
};

export type MediaReference = {
  id: string;
  kind: Exclude<SendKind, "text">;
  /** 渠道不提供的可选信息省略，不填假值。 */
  name?: string;
  mimeType?: string;
  size?: number;
  url?: string;
};

export type MessageBody =
  | { type: "text"; text: string }
  | { type: "image" | "audio" | "video" | "file"; media: MediaReference }
  | { type: "reply"; text: string; attachments: MediaReference[] }
  | { type: "link"; title?: string; url: string; description?: string }
  | { type: "location"; label?: string; latitude: number; longitude: number }
  | { type: "quote"; text: string; quotedText?: string; messageId?: string }
  | {
      type: "card";
      kind: string;
      externalId?: string;
      title?: string;
      url?: string;
    }
  | {
      type: "unknown";
      originalType: string;
      explanation?: string;
      sourceUrl?: string;
    };

/**
 * 契约第 4 节的发送结果：服务端只产 sending/sent/failed，unconfirmed 是本地
 * 对网络失败等不确定结果的乐观标注（见 send-reducers），渠道送达与已读回执
 * 按真实渠道能力另表达，不在这份词表里虚构。
 */
export type DeliveryState = "sending" | "sent" | "failed" | "unconfirmed";

export type InboxMessage = {
  id: string;
  serverId?: string;
  clientRequestId?: string;
  conversationId: string;
  direction: "incoming" | "outgoing" | "system";
  body: MessageBody;
  createdAt: string;
  sequence: number;
  version: number;
  /** 坐席发出的消息才带发送员工与显示名；服务端不返回员工快照表。 */
  senderUserId?: string;
  senderName?: string;
  delivery?: { state: DeliveryState; reason?: string };
};

export type ConversationQuery = {
  search: string;
  channelId: string;
  status: ConversationStatus | "active";
  order: "wait" | "messages";
};

export type Page<T> = { items: T[]; nextCursor: string | null; total?: number };
export type ConversationPage = Page<Conversation> & {
  counts?: {
    active: number;
    needsReply: number;
    waiting: number;
    closed: number;
  };
  channels?: { id: string; name: string }[];
};
export type RequestOptions = { context: WorkContext; signal: AbortSignal };
export type SendTarget = {
  conversationId: string;
  visitorId: string;
  channelId: string;
  accountId: string;
  externalUserId: string;
};

export type SendSubmission = {
  clientRequestId: string;
  target: SendTarget;
  text: string;
};
export type ConnectionState =
  | "unavailable"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected";
/** 契约第 5 节的真实 Socket 报文：只有四类，没有 eventId、游标或回执/移除事件。 */
export type InboxEvent = { context: WorkContext } & (
  | { type: "conversation"; conversation: Conversation }
  | {
      type: "message";
      message: InboxMessage;
      /** 本条消息引起的访客摘要；真实报文与消息同帧下发。 */
      conversation?: Conversation;
    }
  | {
      /** 渠道资料或共享标签/备注保存后：完整名片，不重复身份字段。 */
      type: "profile";
      profile: VisitorProfile;
    }
  | {
      /** 员工组或账号组关系变化后：报文只有 type，客户端重查身份与列表。 */
      type: "access-changed";
    }
);

export type LoadState = {
  status: RequestState;
  error: ApiFailure | null;
  nextCursor: string | null;
  hasLoaded: boolean;
};
