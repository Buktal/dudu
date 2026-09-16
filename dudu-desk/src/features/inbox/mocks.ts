import { en, Faker, zh_CN } from "@faker-js/faker";
import { relativeIso } from "@/lib/time";
import {
  allowedCapability,
  defineConversation,
  restrictedCapability,
  unknownCapability,
} from "./fixtures";
import {
  type DevelopmentTurn,
  developmentEarlierTurns,
  developmentScene,
} from "./mock-conversations";
import { developmentPortrait } from "./mock-portraits";
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
  ["douyin", "抖音", "douyin-live", "木禾生活直播间"],
  ["xiaohongshu", "小红书", "redbook-main", "木禾生活号"],
  ["wecom", "企业微信", "wecom-main", "企业礼赠服务"],
  ["whatsapp", "WhatsApp", "whatsapp-service", "Morrow Studio"],
  ["wechat-mp", "微信公众号", "wechat-mp-main", "木禾生活服务号"],
] as const;
const historyCounts = [34, 52, 26, 38, 30, 44, 28, 32, 42, 24, 36, 46];
const firstWaitingMinutes = [18, 4, 11];
const screenshot = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="460" viewBox="0 0 640 460"><rect width="640" height="460" rx="28" fill="#e8eae3"/><path d="M460 0h180v460h-95Z" fill="#d6dcd2"/><path d="m0 370 640-65v155H0Z" fill="#dfe2d8"/><ellipse cx="310" cy="392" rx="170" ry="24" fill="#747e6f" opacity=".14"/><path d="M245 185v-52c0-105 144-105 144 0v52" fill="none" stroke="#c4bba5" stroke-width="23"/><path d="M245 185v-52c0-105 144-105 144 0v52" fill="none" stroke="#f1ecdb" stroke-width="14"/><path d="m170 170 285 3-16 206c-55 33-190 34-251-3Z" fill="#e6dfcd" stroke="#c9c1ae" stroke-width="2"/><path d="M200 180c9 48 13 132 3 175m225-175c-9 55-13 130-4 178" fill="none" stroke="#c5bca9" stroke-width="3" opacity=".7"/><path d="M272 278h88v47h-88Z" fill="#f5f0df"/><text x="316" y="307" text-anchor="middle" font-family="sans-serif" font-size="18" letter-spacing="3" fill="#847962">MORROW</text><text x="32" y="434" font-family="sans-serif" font-size="14" fill="#777066">米白色云朵托特包 · 细节图</text></svg>',
)}`;

function capability(index: number): ReplyCapability {
  if (index === 4) {
    return restrictedCapability(
      "渠道回复窗口已关闭",
      "等待来访用户再次发起咨询",
    );
  }
  if (index === 5) {
    return unknownCapability("暂未获取到渠道的回复权限", "请刷新会话后重试");
  }
  return allowedCapability(
    index === 6 ? ["text"] : ["text", "image", "file", "audio", "video"],
    {
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
  );
}

function mediaBodies(): MessageBody[] {
  return [
    {
      type: "image",
      media: {
        id: "sample-image",
        kind: "image",
        name: "云朵托特包_米白.svg",
        mimeType: "image/svg+xml",
        size: 1450,
        url: screenshot,
      },
    },
    {
      type: "file",
      media: {
        id: "sample-file",
        kind: "file",
        name: "托特包保养说明.txt",
        mimeType: "text/plain",
        size: 42,
        url: `data:text/plain;charset=utf-8,${encodeURIComponent("保养建议：清洁前先核对洗标，保留订单编号便于后续咨询。")}`,
      },
    },
    {
      type: "audio",
      media: {
        id: "sample-audio",
        kind: "audio",
        name: "肩带问题语音.wav",
        mimeType: "audio/wav",
        size: 32044,
      },
    },
    {
      type: "video",
      media: {
        id: "sample-video",
        kind: "video",
        name: "托特包细节.mp4",
        mimeType: "video/mp4",
        size: 2400000,
      },
    },
    {
      type: "link",
      title: "通勤包尺寸与保养说明",
      url: "https://example.com/help/canvas-tote",
      description: "按商品款式核对尺寸、材质与洗标。",
    },
    {
      type: "location",
      label: "上海市静安区",
      latitude: 31.228,
      longitude: 121.454,
    },
    {
      type: "quote",
      text: "是这一款米白色吗？",
      quotedText: "米白和雾灰两个颜色都可以先确认库存。",
      messageId: "earlier-message",
    },
    {
      type: "card",
      kind: "product",
      externalId: "SKU-DEVELOPMENT-TOTE-IVORY",
      title: "云朵轻量托特包 · 米白",
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
      text: "包身细节已补充，可以先看看米白的纹理。",
      attachments: [
        {
          id: "reply-image",
          kind: "image",
          name: "米白包身细节.svg",
          mimeType: "image/svg+xml",
          size: 1450,
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
export function createDevelopmentFixtures(
  now = "2026-09-16T02:00:00.000Z",
): DevelopmentFixtures {
  const faker = new Faker({ locale: [zh_CN, en] });
  faker.seed(20260916);
  const conversations: Conversation[] = [];
  const messages: Record<string, InboxMessage[]> = {};
  const profiles: Record<string, VisitorProfile> = {};
  for (let index = 0; index < 36; index += 1) {
    const source = sources[index % sources.length];
    const id = `dev-conversation-${String(index + 1).padStart(2, "0")}`;
    const status =
      index > 31
        ? "closed"
        : index >= 3 && index % 3 === 2
          ? "waiting"
          : "needs-reply";
    const scene = developmentScene(index, status);
    const updatedAt = relativeIso(now, -(30 + index * 5));
    const waitingMinutes = firstWaitingMinutes[index] ?? 5 + ((index * 7) % 13);
    const waitingSince =
      status === "needs-reply"
        ? relativeIso(now, -waitingMinutes * 60)
        : undefined;
    const messageCount =
      historyCounts[index % historyCounts.length] -
      Math.floor(index / historyCounts.length) * 2;
    const earlier = developmentEarlierTurns(messageCount - scene.recent.length);
    if (index === 0) {
      // Keep every media contract reachable in older history, outside the latest exchange.
      for (const [position, body] of mediaBodies().entries()) {
        earlier[position * 2] = {
          direction: body.type === "reply" ? "outgoing" : "incoming",
          body,
        };
      }
    }
    const turns = [...earlier, ...scene.recent];
    messages[id] = turns.map((turn, position) =>
      developmentMessage({
        conversationId: id,
        turn,
        position,
        earlierCount: earlier.length,
        now,
        updatedAt,
        waitingSince,
      }),
    );
    const conversation: Conversation = defineConversation({
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
        avatarUrl: index === 7 ? undefined : developmentPortrait(index),
        channelId: source[0],
        channelName: source[1],
        accountId: source[2],
        accountName: source[3],
      },
      status,
      unread: status === "needs-reply" ? (index % 2) + 1 : 0,
      starred: index % 7 === 0,
      preview: scene.preview,
      updatedAt,
      waitingSince,
      messageCount: messages[id].length,
      capability: capability(index),
    });
    conversations.push(conversation);
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
        {
          label: "本次咨询",
          value: { state: "available", value: scene.product },
        },
        { label: "手机号", value: { state: "not-provided" } },
        { label: "邮箱", value: { state: "empty" } },
      ],
      tags: [...scene.tags],
      note: index === 1 ? "" : scene.note,
    };
  }
  return { conversations, messages, profiles };
}

function developmentMessage({
  conversationId,
  turn,
  position,
  earlierCount,
  now,
  updatedAt,
  waitingSince,
}: {
  conversationId: string;
  turn: DevelopmentTurn;
  position: number;
  earlierCount: number;
  now: string;
  updatedAt: string;
  waitingSince?: string;
}): InboxMessage {
  const recentPosition = position - earlierCount;
  const createdAt =
    position < earlierCount
      ? relativeIso(now, -86400 - (earlierCount - position) * 95)
      : waitingSince && recentPosition < 7
        ? relativeIso(waitingSince, (recentPosition - 6) * 75)
        : relativeIso(updatedAt, (recentPosition - 7) * 75);
  return {
    id: `${conversationId}-message-${position + 1}`,
    conversationId,
    ...turn,
    createdAt,
    sequence: position + 1,
    version: 1,
    ...(turn.direction === "outgoing"
      ? { delivery: { state: "read" as const } }
      : {}),
  };
}
