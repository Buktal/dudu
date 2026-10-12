import { DeskApiError } from "@/lib/api-response";
import { requestDesk } from "@/lib/desk-http";
import { readDeskToken, resolveDeskOrigin } from "@/lib/desk-session";
import { type InboxApi, unavailableInboxApi } from "./api";
import type {
  Conversation,
  ConversationPage,
  ConversationStatus,
  ReplyCapability,
  SendKind,
  VisitorIdentity,
} from "./types";

/** 访客摘要页大小：与契约默认 pageSize 一致，翻页由页码游标驱动。 */
const PAGE_SIZE = 30;
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
    // 服务端不返回个人已读；待处理提醒由实时票在本地维护，重登不制造旧提示
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

/**
 * 真实接待适配器（访客摘要部分）：列表查询走 POST /api/desk/visitors/query，
 * 其余能力（历史、发送、状态、资料、订阅）暂未接入，沿用 unavailableInboxApi 的语义，
 * 界面继续呈现「接待服务未连接」空态；token 由账户适配器写入会话，这里按请求读取。
 */
export function createHttpInboxApi(
  options: { origin?: string; fetcher?: typeof fetch } = {},
): InboxApi {
  const origin = resolveDeskOrigin(options.origin);

  return {
    ...unavailableInboxApi,
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
