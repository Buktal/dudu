import { DeskApiError } from "@/lib/api-response";
import { requestDesk } from "@/lib/desk-http";
import { readDeskToken, resolveDeskOrigin } from "@/lib/desk-session";
import { type InboxApi, unavailableInboxApi } from "./api";
import { type DeskSocket, subscribeDeskSocket } from "./inbox-live-socket";
import type {
  Conversation,
  ConversationPage,
  ConversationStatus,
  DeliveryState,
  InboxEvent,
  InboxMessage,
  MessageBody,
  Page,
  ReplyCapability,
  SendKind,
  VisitorIdentity,
  WorkContext,
} from "./types";

/** 访客摘要页大小：与契约默认 pageSize 一致，翻页由页码游标驱动。 */
const PAGE_SIZE = 30;
/** 历史页大小：与契约默认 limit 一致；更早页由 beforeSequence 游标驱动。 */
const HISTORY_LIMIT = 30;
const QUERY_PATH = "/desk/visitors/query";

const CONVERSATION_STATUSES: ConversationStatus[] = [
  "needs-reply",
  "waiting",
  "closed",
];
const CAPABILITY_STATES: ReplyCapability["state"][] = [
  "allowed",
  "restricted",
  "unknown",
];
const SEND_KINDS: SendKind[] = ["text", "image", "file", "audio", "video"];

type ParsedConversationPage = {
  items: Conversation[];
  total: number;
  page: number;
  pageSize: number;
  counts: NonNullable<ConversationPage["counts"]>;
  channels: NonNullable<ConversationPage["channels"]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
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

function parseIdentity(value: unknown): VisitorIdentity {
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
    nextStep: optionalText(value.nextStep),
  };
}

function parseConversation(value: unknown): Conversation {
  if (
    !isRecord(value) ||
    !CONVERSATION_STATUSES.includes(value.status as ConversationStatus)
  )
    throw new TypeError("会话格式不完整");
  return {
    id: nonEmptyText(value.id),
    identity: parseIdentity(value.identity),
    status: value.status as ConversationStatus,
    // 服务端不返回个人已读；待处理提醒由本地运行态维护（stores/reminders.ts），重登不制造旧提示
    unread: 0,
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

function parseConversationPage(data: unknown): ParsedConversationPage {
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
function pageNumber(cursor: string | undefined): number {
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
const DELIVERY_STATES: DeliveryState[] = [
  "sending",
  "sent",
  "failed",
  "accepted",
  "delivered",
  "read",
  "unconfirmed",
];

function parseBody(value: unknown): MessageBody {
  if (!isRecord(value) || typeof value.type !== "string")
    throw new TypeError("消息内容格式不完整");
  if (value.type === "text") {
    if (typeof value.text !== "string") throw new TypeError("文本消息缺少正文");
    return { type: "text", text: value.text };
  }
  // 非文本内容（图片/文件/链接等）的展示由后续实施票接通；先如实归入未知类型，不猜结构
  return { type: "unknown", originalType: value.type };
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

function parseMessage(value: unknown): InboxMessage {
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

function parseMessagePage(data: unknown): Page<InboxMessage> {
  if (!isRecord(data) || !Array.isArray(data.items))
    throw new TypeError("消息页格式不完整");
  return {
    items: data.items.map(parseMessage),
    nextCursor: data.nextCursor === null ? null : nonEmptyText(data.nextCursor),
  };
}

// 更早游标：没有游标取最近一页；非法游标按无效响应处理，不猜测序号
function beforeSequence(cursor: string | undefined): string | undefined {
  if (cursor === undefined) return undefined;
  const sequence = Number(cursor);
  if (!Number.isSafeInteger(sequence) || sequence < 1)
    throw new DeskApiError("invalid-response", "历史游标无效，请刷新后重试");
  return cursor;
}

// 实时报文映射：message 帧携带本条消息引起的访客摘要；其余报文类型由后续实施票接通
function parseLiveEvent(
  value: unknown,
  context: WorkContext,
): InboxEvent | undefined {
  if (!isRecord(value) || value.type !== "message") return undefined;
  try {
    return {
      type: "message",
      context,
      message: parseMessage(value.message),
      conversation:
        value.conversation === undefined
          ? undefined
          : parseConversation(value.conversation),
    };
  } catch {
    // 不完整报文丢弃该帧，已建立的连接与既有数据不受影响
    return undefined;
  }
}

/**
 * 真实接待适配器（访客摘要、按需历史、文本回复与实时通道）：列表查询走
 * POST /api/desk/visitors/query，历史分页走 GET /api/desk/visitors/{visitorId}/messages
 * （最近页无 beforeSequence，更早页用上一页 nextCursor）；回复走
 * POST /api/desk/visitors/{visitorId}/messages，能力走同一资源的 capability；
 * 订阅连接 /ws/desk，ready 后接收 message 报文；状态与资料等其余能力沿用
 * unavailableInboxApi 的语义；token 由账户适配器写入会话，这里按请求读取。
 */
export function createHttpInboxApi(
  options: {
    origin?: string;
    fetcher?: typeof fetch;
    socket?: (url: string) => DeskSocket;
  } = {},
): InboxApi {
  const origin = resolveDeskOrigin(options.origin);

  return {
    ...unavailableInboxApi,
    // 服务端不返回个人已读：待处理提醒、标记已读都留在本地运行态
    localUnread: true,
    subscribe({ context, signal, onEvent, onConnection }) {
      const token = readDeskToken(origin);
      if (token === null) {
        // 无登录凭据时不发起连接，按服务未接入如实上报
        onConnection("unavailable");
        return () => {};
      }
      return subscribeDeskSocket({
        origin,
        token,
        signal,
        socket: options.socket,
        onState: onConnection,
        onFrame: (frame) => {
          const event = parseLiveEvent(frame, context);
          if (event) onEvent(event);
        },
      });
    },
    async listMessages({ conversationId, cursor, signal }) {
      const before = beforeSequence(cursor);
      const params = new URLSearchParams();
      if (before !== undefined) params.set("beforeSequence", before);
      params.set("limit", String(HISTORY_LIMIT));
      return requestDesk({
        url: `${origin}/api/desk/visitors/${encodeURIComponent(conversationId)}/messages?${params}`,
        token: readDeskToken(origin) ?? undefined,
        signal,
        parse: parseMessagePage,
        fetcher: options.fetcher,
      });
    },
    async send({ target, clientRequestId, text, attachments, signal }) {
      // 本轮只接纯文本：附件发送尚未接入，拒绝而不是静默丢弃
      if (attachments.length)
        throw new DeskApiError(
          "unavailable",
          "当前仅支持文字回复，附件发送尚未接入",
        );
      return requestDesk({
        url: `${origin}/api/desk/visitors/${encodeURIComponent(target.conversationId)}/messages`,
        method: "POST",
        token: readDeskToken(origin) ?? undefined,
        signal,
        body: { clientRequestId, text },
        parse: parseMessage,
        fetcher: options.fetcher,
      });
    },
    async getCapability({ conversationId, signal }) {
      return requestDesk({
        url: `${origin}/api/desk/visitors/${encodeURIComponent(conversationId)}/capability`,
        token: readDeskToken(origin) ?? undefined,
        signal,
        parse: parseCapability,
        fetcher: options.fetcher,
      });
    },
    async listConversations({ query, cursor, signal }) {
      const page = pageNumber(cursor);
      const data = await requestDesk({
        url: `${origin}/api${QUERY_PATH}`,
        method: "POST",
        token: readDeskToken(origin) ?? undefined,
        signal,
        body: {
          search: query.search,
          channelId: query.channelId,
          status: query.status,
          order: query.order,
          page,
          pageSize: PAGE_SIZE,
        },
        parse: parseConversationPage,
        fetcher: options.fetcher,
      });
      // 服务端按页码普通分页；还有下一页时游标为下一页页码字符串，尾页为 null
      const consumed = (data.page - 1) * data.pageSize + data.items.length;
      return {
        items: data.items,
        nextCursor:
          data.pageSize > 0 && consumed < data.total
            ? String(data.page + 1)
            : null,
        total: data.total,
        counts: data.counts,
        channels: data.channels,
      };
    },
  };
}
