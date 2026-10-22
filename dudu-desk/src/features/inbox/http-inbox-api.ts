import { requestDesk, requestDeskBlob } from "@/lib/desk-http";
import { readDeskToken, resolveDeskOrigin } from "@/lib/desk-session";
import { isRecord } from "@/lib/is-record";
import { type InboxApi, unavailableInboxApi } from "./api";
import {
  beforeSequence,
  pageNumber,
  parseConversation,
  parseConversationPage,
  parseMessage,
  parseMessagePage,
  parseProfile,
} from "./http-inbox-contract";
import { type DeskSocket, subscribeDeskSocket } from "./inbox-live-socket";
import type { ConversationStatus, InboxEvent, WorkContext } from "./types";

/** 访客摘要页大小：与契约默认 pageSize 一致，翻页由页码游标驱动。 */
const PAGE_SIZE = 30;
/** 历史页大小：与契约默认 limit 一致；更早页由 beforeSequence 游标驱动。 */
const HISTORY_LIMIT = 30;
const QUERY_PATH = "/desk/visitors/query";

// 接待状态写入：结束与继续共用同一资源，后端返回保存后的完整会话对象
function writeConversationStatus(
  origin: string,
  conversationId: string,
  status: ConversationStatus,
  signal: AbortSignal,
  fetcher?: typeof fetch,
) {
  return requestDesk({
    url: `${origin}/api/desk/visitors/${encodeURIComponent(conversationId)}/status`,
    method: "PUT",
    token: readDeskToken(origin) ?? undefined,
    signal,
    body: { status },
    parse: parseConversation,
    fetcher,
  });
}

// 实时报文映射：message 帧携带本条消息引起的访客摘要，conversation 帧携带状态变更后的摘要，
// profile 帧携带渠道资料或标签/备注保存后的完整名片，access-changed 帧只有类型
function parseLiveEvent(
  value: unknown,
  context: WorkContext,
): InboxEvent | undefined {
  if (!isRecord(value)) return undefined;
  try {
    if (value.type === "access-changed")
      return { type: "access-changed", context };
    if (value.type === "conversation")
      return {
        type: "conversation",
        context,
        conversation: parseConversation(value.conversation),
      };
    if (value.type === "profile")
      return {
        type: "profile",
        context,
        profile: parseProfile(value.profile),
      };
    if (value.type !== "message") return undefined;
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
 * 真实接待适配器（访客摘要、按需历史、文本回复、共享名片、结束 / 继续与实时通道）：
 * 列表查询走 POST /api/desk/visitors/query，历史分页走
 * GET /api/desk/visitors/{visitorId}/messages（最近页无 beforeSequence，更早页用上一页
 * nextCursor）；回复走 POST /api/desk/visitors/{visitorId}/messages（回复能力随会话
 * 下发，不单独取），名片读取 / 保存走 GET/PUT /api/desk/visitors/{visitorId}/profile，
 * 结束 / 继续走 PUT /api/desk/visitors/{visitorId}/status；订阅连接 /ws/desk，
 * ready 后接收 message、conversation、profile 与 access-changed 报文；
 * token 由账户适配器写入会话，这里按请求读取。
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
    async send({ target, clientRequestId, text, signal }) {
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
    async endConversation({ conversationId, signal }) {
      return writeConversationStatus(
        origin,
        conversationId,
        "closed",
        signal,
        options.fetcher,
      );
    },
    async resumeConversation({ conversationId, signal }) {
      return writeConversationStatus(
        origin,
        conversationId,
        "needs-reply",
        signal,
        options.fetcher,
      );
    },
    async readProfile({ conversationId, signal }) {
      return requestDesk({
        url: `${origin}/api/desk/visitors/${encodeURIComponent(conversationId)}/profile`,
        token: readDeskToken(origin) ?? undefined,
        signal,
        parse: parseProfile,
        fetcher: options.fetcher,
      });
    },
    async saveProfile({ conversationId, tags, note, signal }) {
      // 契约只接受标签与备注：渠道资料由入站管道维护，版本冲突不由服务端拒绝
      return requestDesk({
        url: `${origin}/api/desk/visitors/${encodeURIComponent(conversationId)}/profile`,
        method: "PUT",
        token: readDeskToken(origin) ?? undefined,
        signal,
        body: { tags, note },
        parse: parseProfile,
        fetcher: options.fetcher,
      });
    },
    async loadMessageMedia({ messageId, index, signal }) {
      // 公开链接的素材由界面直连渠道：这里只取需要渠道凭据的字节，JWT 只出现在请求头
      return requestDeskBlob({
        url: `${origin}/api/desk/messages/${encodeURIComponent(messageId)}/media?index=${index}`,
        token: readDeskToken(origin) ?? undefined,
        signal,
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
