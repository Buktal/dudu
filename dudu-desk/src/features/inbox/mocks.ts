import { en, Faker, zh_CN } from "@faker-js/faker";
import type {
  Conversation,
  InboxMessage,
  MessageBody,
  ReplyCapability,
  VisitorProfile,
} from "./types";

const sources = [
  ["wechat-kf", "微信客服", "wechat-main", "品牌旗舰店"],
  ["telegram", "Telegram", "telegram-service", "海外服务"],
  ["wechat-kf", "微信客服", "wechat-outlet", "官方折扣店"],
  ["web", "在线咨询", "web-main", "品牌官网"],
] as const;
const topics = [
  "你好，想确认一下这款还有现货吗？",
  "收货地址可以帮我调整一下吗？",
  "已经收到啦，谢谢你的耐心解答。",
  "刚刚上传了照片，麻烦帮忙看一下。",
  "预计什么时候可以收到快递呢？",
  "想了解一下售后的处理进度。",
] as const;
const screenshot = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" rx="28" fill="#f2ece2"/><rect x="48" y="48" width="544" height="304" rx="20" fill="#fffdf8"/><rect x="80" y="88" width="180" height="150" rx="16" fill="#ceb99a"/><path d="M124 124h92v80h-92z" fill="#faf7ef"/><text x="290" y="135" font-size="24" fill="#443f39">订单资料</text><text x="290" y="181" font-size="18" fill="#777066">开发联调图片</text><text x="80" y="300" font-size="16" fill="#777066">此图片仅用于开发环境展示</text></svg>',
)}`;

function capability(index: number): ReplyCapability {
  if (index === 4) {
    return {
      state: "restricted",
      kinds: [],
      reason: "渠道回复窗口已关闭",
      nextStep: "等待来访用户再次发起咨询",
    };
  }
  if (index === 5) {
    return {
      state: "unknown",
      kinds: [],
      reason: "暂未获取到渠道的回复权限",
      nextStep: "请刷新会话后重试",
    };
  }
  return {
    state: "allowed",
    kinds: index === 6 ? ["text"] : ["text", "image", "file", "audio", "video"],
    attachments: {
      maxBytes: 20 * 1024 * 1024,
      maxCount: 4,
      mimeTypes: [
        "image/*",
        "audio/*",
        "video/*",
        "application/pdf",
        "text/plain",
      ],
    },
  };
}

function mediaBodies(): MessageBody[] {
  return [
    {
      type: "image",
      media: {
        id: "sample-image",
        kind: "image",
        name: "订单资料.svg",
        mimeType: "image/svg+xml",
        size: 720,
        url: screenshot,
      },
    },
    {
      type: "file",
      media: {
        id: "sample-file",
        kind: "file",
        name: "售后说明.txt",
        mimeType: "text/plain",
        size: 42,
        url: `data:text/plain;charset=utf-8,${encodeURIComponent("开发联调文件：请保留订单编号与收货照片。")}`,
      },
    },
    {
      type: "audio",
      media: {
        id: "sample-audio",
        kind: "audio",
        name: "语音咨询.wav",
        mimeType: "audio/wav",
        size: 32044,
      },
    },
    {
      type: "video",
      media: {
        id: "sample-video",
        kind: "video",
        name: "商品情况.mp4",
        mimeType: "video/mp4",
        size: 2400000,
      },
    },
    {
      type: "link",
      title: "订单查询帮助",
      url: "https://example.com/help/orders",
      description: "请以渠道提供的订单资料为准。",
    },
    {
      type: "location",
      label: "上海市静安区",
      latitude: 31.228,
      longitude: 121.454,
    },
    {
      type: "quote",
      text: "是这一款吗？",
      quotedText: "可以帮你确认库存。",
      messageId: "earlier-message",
    },
    {
      type: "card",
      kind: "product",
      externalId: "SKU-DEVELOPMENT",
      title: "燕麦随行杯 · 原色款",
      url: "https://example.com/products/demo",
    },
    {
      type: "unknown",
      originalType: "channel-interactive",
      explanation: "该渠道交互消息暂不支持完整展示",
      sourceUrl: "https://example.com/messages/demo",
    },
    {
      type: "reply",
      text: "资料已补充，请查收。",
      attachments: [
        {
          id: "reply-image",
          kind: "image",
          name: "补充资料.svg",
          mimeType: "image/svg+xml",
          size: 720,
          url: screenshot,
        },
      ],
    },
  ];
}

export type DevelopmentFixtures = {
  conversations: Conversation[];
  messages: Record<string, InboxMessage[]>;
  profiles: Record<string, VisitorProfile>;
};

/** Fixed seed; each adapter/context receives independent objects. Never imported in production. */
export function createDevelopmentFixtures(): DevelopmentFixtures {
  const faker = new Faker({ locale: [zh_CN, en] });
  faker.seed(20260916);
  const conversations: Conversation[] = [];
  const messages: Record<string, InboxMessage[]> = {};
  const profiles: Record<string, VisitorProfile> = {};
  for (let index = 0; index < 36; index += 1) {
    const source = sources[index % sources.length];
    const id = `dev-conversation-${String(index + 1).padStart(2, "0")}`;
    const conversation: Conversation = {
      id,
      identity: {
        id: faker.string.uuid(),
        externalUserId: `dev-external-${index + 1}`,
        name:
          index < 3
            ? "林小满"
            : index === 7
              ? undefined
              : faker.person.fullName(),
        channelId: source[0],
        channelName: source[1],
        accountId: source[2],
        accountName: source[3],
      },
      status:
        index > 31 ? "closed" : index % 3 === 2 ? "waiting" : "needs-reply",
      unread: index % 3 === 2 ? 0 : (index % 4) + 1,
      starred: index % 7 === 0,
      preview: topics[index % topics.length],
      updatedAt: `2026-09-15T17:${String(59 - index).padStart(2, "0")}:00Z`,
      version: 1,
      capability: capability(index),
    };
    conversations.push(conversation);
    const bodies: MessageBody[] = Array.from({ length: 28 }, (_, position) => ({
      type: "text",
      text:
        position % 2 === 0
          ? topics[position % topics.length]
          : "收到，我来帮你查看，请稍等片刻。",
    }));
    if (index === 0) bodies.push(...mediaBodies());
    bodies.push({ type: "text", text: conversation.preview });
    messages[id] = bodies.map((body, position) => ({
      id: `${id}-message-${position + 1}`,
      conversationId: id,
      direction: position % 2 === 0 ? "incoming" : "outgoing",
      body,
      createdAt: `2026-09-15T16:${String(position).padStart(2, "0")}:00Z`,
      sequence: position + 1,
      version: 1,
      ...(position % 2 === 1 ? { delivery: { state: "read" as const } } : {}),
    }));
    profiles[id] = {
      conversationId: id,
      version: 1,
      fields: [
        {
          label: "来访用户 ID",
          value: {
            state: "available",
            value: conversation.identity.externalUserId,
          },
        },
        {
          label: "地区",
          value:
            index % 3 === 0
              ? { state: "available", value: "上海" }
              : { state: "not-provided" },
        },
        { label: "手机号", value: { state: "not-provided" } },
        { label: "邮箱", value: { state: "empty" } },
      ],
      tags: index % 3 === 0 ? ["售后咨询", "需跟进"] : [],
      note: index === 0 ? "来访用户正在确认商品库存，优先核对同款颜色。" : "",
    };
  }
  return { conversations, messages, profiles };
}
