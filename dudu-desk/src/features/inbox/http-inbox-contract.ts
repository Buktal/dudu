/**
 * Server 报文到 Desk 对象的解析：适配器的信任边界。适配器（http-inbox-api）与
 * 实时报文共用同一份契约解析，任何报文字段漂移都在这里按无效响应拒绝，
 * 不把半成品对象放进界面状态。
 */
import { DeskApiError } from "@/lib/api-response";
import type {
  Conversation,
  ConversationPage,
  ConversationStatus,
  DeliveryState,
  InboxMessage,
  MediaReference,
  MessageBody,
  Page,
  ReplyCapability,
  SendKind,
  VisitorIdentity,
  VisitorProfile,
} from "./types";

const CONVERSATION_STATUSES: ConversationStatus[] = [
  "needs-reply",
  "waiting",
  "closed",
];
// 服务端 capability() 只产 allowed/restricted 两态；契约外词表按无效响应拒绝
const CAPABILITY_STATES: ReplyCapability["state"][] = ["allowed", "restricted"];
const SEND_KINDS: SendKind[] = ["text", "image", "file", "audio", "video"];

export type ParsedConversationPage = {
  items: Conversation[];
  total: number;
  page: number;
  pageSize: number;
  counts: NonNullable<ConversationPage["counts"]>;
  channels: NonNullable<ConversationPage["channels"]>;
};

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new TypeError("缺少必要的文本字段");
  return value;
}

function nonEmptyText(value: unknown): string {
  const parsed = text(value);
  if (!parsed) throw new TypeError("缺少必要的文本字段");
  return parsed;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function integer(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value))
    throw new TypeError("缺少必要的整数");
  return value;
}

export function parseIdentity(value: unknown): VisitorIdentity {
  if (!isRecord(value)) throw new TypeError("访客身份格式不完整");
  return {
    id: nonEmptyText(value.id),
    externalUserId: text(value.externalUserId),
    name: optionalText(value.name),
    avatarUrl: optionalText(value.avatarUrl),
    channelId: nonEmptyText(value.channelId),
    channelName: nonEmptyText(value.channelName),
    accountId: nonEmptyText(value.accountId),
    accountName: text(value.accountName),
  };
}

function parseCapability(value: unknown): ReplyCapability {
  if (
    !isRecord(value) ||
    !CAPABILITY_STATES.includes(value.state as ReplyCapability["state"]) ||
    !Array.isArray(value.kinds) ||
    value.kinds.some((kind) => !SEND_KINDS.includes(kind as SendKind))
  )
    throw new TypeError("回复能力格式不完整");
  return {
    state: value.state as ReplyCapability["state"],
    kinds: value.kinds as SendKind[],
    reason: optionalText(value.reason),
  };
}

export function parseConversation(value: unknown): Conversation {
  if (
    !isRecord(value) ||
    !CONVERSATION_STATUSES.includes(value.status as ConversationStatus)
  )
    throw new TypeError("会话格式不完整");
  return {
    id: nonEmptyText(value.id),
    identity: parseIdentity(value.identity),
    status: value.status as ConversationStatus,
    preview: text(value.preview),
    updatedAt: nonEmptyText(value.updatedAt),
    waitingSince: optionalText(value.waitingSince),
    messageCount:
      value.messageCount === undefined
        ? undefined
        : integer(value.messageCount),
    version: integer(value.version),
    capability: parseCapability(value.capability),
  };
}

function parseProfileField(value: unknown): VisitorProfile["fields"][number] {
  if (!isRecord(value) || !isRecord(value.value))
    throw new TypeError("渠道资料项格式不完整");
  const label = text(value.label);
  const state = value.value.state;
  // 缺失与空内容各有明确状态，不合并也不填假值
  if (state === "available")
    return { label, value: { state, value: text(value.value.value) } };
  if (state === "empty" || state === "not-provided")
    return { label, value: { state } };
  throw new TypeError("渠道资料取值格式不完整");
}

export function parseProfile(value: unknown): VisitorProfile {
  if (
    !isRecord(value) ||
    !Array.isArray(value.fields) ||
    !Array.isArray(value.tags) ||
    value.tags.some((tag) => typeof tag !== "string")
  )
    throw new TypeError("访客名片格式不完整");
  return {
    conversationId: nonEmptyText(value.conversationId),
    version: integer(value.version),
    fields: value.fields.map(parseProfileField),
    tags: value.tags as string[],
    note: text(value.note),
  };
}

function parseCounts(value: unknown): ParsedConversationPage["counts"] {
  if (!isRecord(value)) throw new TypeError("授权范围计数格式不完整");
  return {
    active: integer(value.active),
    needsReply: integer(value.needsReply),
    waiting: integer(value.waiting),
    closed: integer(value.closed),
  };
}

function parseChannels(value: unknown): ParsedConversationPage["channels"] {
  if (!Array.isArray(value)) throw new TypeError("渠道列表格式不完整");
  return value.map((item) => {
    if (!isRecord(item)) throw new TypeError("渠道列表格式不完整");
    return { id: nonEmptyText(item.id), name: text(item.name) };
  });
}

export function parseConversationPage(data: unknown): ParsedConversationPage {
  if (!isRecord(data) || !Array.isArray(data.items))
    throw new TypeError("访客摘要页格式不完整");
  return {
    items: data.items.map(parseConversation),
    total: integer(data.total),
    page: integer(data.page),
    pageSize: integer(data.pageSize),
    counts: parseCounts(data.counts),
    channels: parseChannels(data.channels),
  };
}

// 页码游标：没有游标取第一页，非法游标按无效响应处理，不猜测页码
export function pageNumber(cursor: string | undefined): number {
  if (cursor === undefined) return 1;
  const page = Number(cursor);
  if (!Number.isSafeInteger(page) || page < 1)
    throw new DeskApiError("invalid-response", "分页游标无效，请刷新后重试");
  return page;
}

const MESSAGE_DIRECTIONS: InboxMessage["direction"][] = [
  "incoming",
  "outgoing",
  "system",
];
// 契约第 4 节的发送结果三态。其余取值（accepted/delivered/read/unconfirmed 等
// 契约外词表）不猜、不静默通过，统一按无效响应拒绝；真实链路只认这三种。
const DELIVERY_STATES: DeliveryState[] = ["sending", "sent", "failed"];

const MEDIA_KINDS: MediaReference["kind"][] = [
  "image",
  "audio",
  "video",
  "file",
];

// 媒体引用：id 与类型必有；渠道不提供的 name/mimeType/size/url 省略，不填假值
function parseMediaReference(value: unknown): MediaReference {
  if (!isRecord(value) || typeof value.kind !== "string")
    throw new TypeError("媒体引用格式不完整");
  const kind = value.kind as MediaReference["kind"];
  if (!MEDIA_KINDS.includes(kind)) throw new TypeError("媒体引用缺少类型");
  const name = optionalText(value.name);
  const mimeType = optionalText(value.mimeType);
  const size = value.size === undefined ? undefined : integer(value.size);
  const url = value.url === undefined ? undefined : text(value.url);
  return {
    id: nonEmptyText(value.id),
    kind,
    ...(name === undefined ? {} : { name }),
    ...(mimeType === undefined ? {} : { mimeType }),
    ...(size === undefined ? {} : { size }),
    ...(url === undefined ? {} : { url }),
  };
}

// 契约第 4 节各分支；契约之外的渠道类型如实归入 unknown，不猜结构
function parseBody(value: unknown): MessageBody {
  if (!isRecord(value) || typeof value.type !== "string")
    throw new TypeError("消息内容格式不完整");
  switch (value.type) {
    case "text":
      if (typeof value.text !== "string")
        throw new TypeError("文本消息缺少正文");
      return { type: "text", text: value.text };
    case "image":
    case "audio":
    case "video":
    case "file": {
      const media = parseMediaReference(value.media);
      if (media.kind !== value.type)
        throw new TypeError("媒体类型与消息类型不一致");
      return { type: value.type, media };
    }
    case "reply": {
      if (typeof value.text !== "string" || !Array.isArray(value.attachments))
        throw new TypeError("附件回复格式不完整");
      return {
        type: "reply",
        text: value.text,
        attachments: value.attachments.map(parseMediaReference),
      };
    }
    case "link": {
      const title = optionalText(value.title);
      const description = optionalText(value.description);
      return {
        type: "link",
        url: nonEmptyText(value.url),
        ...(title === undefined ? {} : { title }),
        ...(description === undefined ? {} : { description }),
      };
    }
    case "location": {
      const label = optionalText(value.label);
      return {
        type: "location",
        latitude: number(value.latitude),
        longitude: number(value.longitude),
        ...(label === undefined ? {} : { label }),
      };
    }
    case "quote": {
      const quotedText = optionalText(value.quotedText);
      const messageId = optionalText(value.messageId);
      return {
        type: "quote",
        text: text(value.text),
        ...(quotedText === undefined ? {} : { quotedText }),
        ...(messageId === undefined ? {} : { messageId }),
      };
    }
    case "card": {
      const externalId = optionalText(value.externalId);
      const title = optionalText(value.title);
      const url = optionalText(value.url);
      return {
        type: "card",
        kind: nonEmptyText(value.kind),
        ...(externalId === undefined ? {} : { externalId }),
        ...(title === undefined ? {} : { title }),
        ...(url === undefined ? {} : { url }),
      };
    }
    case "unknown": {
      const explanation = optionalText(value.explanation);
      const sourceUrl = optionalText(value.sourceUrl);
      return {
        type: "unknown",
        originalType: optionalText(value.originalType) ?? "unknown",
        ...(explanation === undefined ? {} : { explanation }),
        ...(sourceUrl === undefined ? {} : { sourceUrl }),
      };
    }
    default:
      return { type: "unknown", originalType: value.type };
  }
}

function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new TypeError("缺少必要的数字");
  return value;
}

function parseDelivery(value: unknown): InboxMessage["delivery"] {
  if (!isRecord(value)) throw new TypeError("发送结果格式不完整");
  if (!DELIVERY_STATES.includes(value.state as DeliveryState))
    throw new TypeError("发送结果格式不完整");
  return {
    state: value.state as DeliveryState,
    reason: optionalText(value.reason),
  };
}

export function parseMessage(value: unknown): InboxMessage {
  if (
    !isRecord(value) ||
    !MESSAGE_DIRECTIONS.includes(value.direction as InboxMessage["direction"])
  )
    throw new TypeError("消息格式不完整");
  const outgoing = value.direction === "outgoing";
  return {
    id: nonEmptyText(value.id),
    conversationId: nonEmptyText(value.conversationId),
    clientRequestId: optionalText(value.clientRequestId),
    direction: value.direction as InboxMessage["direction"],
    body: parseBody(value.body),
    createdAt: nonEmptyText(value.createdAt),
    sequence: integer(value.sequence),
    version: integer(value.version),
    senderUserId: outgoing ? optionalText(value.senderUserId) : undefined,
    senderName: outgoing ? optionalText(value.senderName) : undefined,
    delivery: outgoing ? parseDelivery(value.delivery) : undefined,
  };
}

export function parseMessagePage(data: unknown): Page<InboxMessage> {
  if (!isRecord(data) || !Array.isArray(data.items))
    throw new TypeError("消息页格式不完整");
  return {
    items: data.items.map(parseMessage),
    nextCursor: data.nextCursor === null ? null : nonEmptyText(data.nextCursor),
  };
}

// 更早游标：没有游标取最近一页；非法游标按无效响应处理，不猜测序号
export function beforeSequence(cursor: string | undefined): string | undefined {
  if (cursor === undefined) return undefined;
  const sequence = Number(cursor);
  if (!Number.isSafeInteger(sequence) || sequence < 1)
    throw new DeskApiError("invalid-response", "历史游标无效，请刷新后重试");
  return cursor;
}
