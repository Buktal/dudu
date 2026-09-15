import { faker } from "@faker-js/faker/locale/zh_CN";
import type { ChannelKey, Message, Visitor } from "../../types";

const msg = (
  id: string,
  text: string,
  role: Message["role"] = "visitor",
  kind: Message["kind"] = "text",
  time = "14:26",
): Message => ({
  id,
  text,
  role,
  kind,
  time,
  ...(role === "agent" ? { status: "sent" as const } : {}),
});

// Handwritten scenarios; Faker only fills stable non-semantic identifiers.
export function createConversations(): Visitor[] {
  faker.seed(20260915);
  const person = (
    id: string,
    name: string,
    channel: ChannelKey,
    avatar: number | null,
    wait: number,
    text: string,
    extra: Partial<Visitor> = {},
  ): Visitor => ({
    id,
    name,
    channel,
    avatar,
    wait,
    account:
      channel === "whatsapp" || channel === "telegram"
        ? "Morrow Studio"
        : "木禾生活",
    handle: `${channel === "wechat" ? "wm" : channel.slice(0, 3)}_${faker.string.alphanumeric(9)}`,
    color: ["#e8c5b0", "#c8d8cd", "#d4cde8", "#e8d9b5", "#bbd3e1", "#e7c6c8"][
      avatar ?? 4
    ],
    status: "needs-reply",
    unread: 1,
    tags: ["首次咨询"],
    note: "",
    source: "渠道未提供",
    firstVisit: "今天 14:18",
    starred: false,
    replyOpen: true,
    messages: [
      msg(
        `${id}-1`,
        "你好，欢迎来到木禾生活。有什么可以帮到你？",
        "agent",
        "text",
        "14:20",
      ),
      msg(`${id}-2`, text),
    ],
    ...extra,
  });
  return [
    person("lin", "林小满", "xiaohongshu", 0, 268, "可以看看米白色的实拍吗？", {
      unread: 0,
      tags: ["颜色咨询", "偏好米白"],
      source: "访客分享的商品卡片",
      firstVisit: "今天 14:18",
      starred: true,
      note: "想买一只日常通勤用的包，喜欢简洁的款式。",
      messages: [
        msg("lin-1", "你好呀，想问一下这款包～", "visitor", "text", "14:18"),
        msg("lin-2", "云朵轻量托特包", "visitor", "product", "14:18"),
        msg(
          "lin-3",
          "你好小满，云朵包有米白和雾灰两个颜色，都可以正常发货。",
          "agent",
          "text",
          "14:20",
        ),
        msg(
          "lin-4",
          "我平时通勤带一台 13 寸电脑，装得下吗？",
          "visitor",
          "text",
          "14:23",
        ),
        msg(
          "lin-5",
          "可以的，包身宽 36cm，放下电脑后还有空间放水杯和雨伞。",
          "agent",
          "text",
          "14:24",
        ),
        msg(
          "lin-6",
          "那太好了，可以看看米白色的实拍吗？",
          "visitor",
          "text",
          "14:26",
        ),
      ],
    }),
    person(
      "chen",
      "陈一舟",
      "wechat",
      null,
      211,
      "你好，我昨天发的图片收到了吗？",
      {
        tags: ["图片咨询"],
        firstVisit: "昨天 16:42",
        messages: [
          msg("chen-1", "这是我想找的款式。", "visitor", "text", "14:19"),
          msg("chen-2", "参考图片 · 帆布包", "visitor", "image", "14:19"),
          msg("chen-3", "你好，我昨天发的图片收到了吗？"),
        ],
      },
    ),
    person("zhou", "周予安", "douyin", 1, 174, "雾灰色的肩带可以调节吗？", {
      tags: ["商品咨询"],
      messages: [
        msg(
          "zhou-1",
          "刷到你们的视频了，包的颜色很好看。",
          "visitor",
          "text",
          "14:21",
        ),
        msg("zhou-2", "谢谢喜欢！你想了解哪一款？", "agent", "text", "14:22"),
        msg("zhou-3", "云朵轻量托特包", "visitor", "product", "14:23"),
        msg("zhou-4", "雾灰色的肩带可以调节吗？", "visitor", "text", "14:27"),
      ],
    }),
    person(
      "amelia",
      "Amelia",
      "whatsapp",
      2,
      126,
      "Do you ship to Singapore?",
      {
        tags: ["English"],
        location: "Singapore · 访客自述",
        messages: [
          msg(
            "amelia-1",
            "Hi! I love the canvas tote in your collection.",
            "visitor",
            "text",
            "14:25",
          ),
          {
            ...msg(
              "amelia-2",
              "Hi Amelia, happy to help. Where would you like it shipped?",
              "agent",
              "text",
              "14:26",
            ),
            status: "read",
          },
          msg("amelia-3", "Do you ship to Singapore?"),
        ],
      },
    ),
    person("xu", "许小橙", "wechat-mp", 3, 96, "想问下清洗和保养的方法。", {
      tags: ["使用咨询"],
      messages: [
        msg("xu-1", "包包收到啦，手感很好！", "visitor", "text", "14:25"),
        msg("xu-2", "想问下清洗和保养的方法。", "visitor", "voice", "14:28"),
      ],
    }),
    person("mia", "Mia", "telegram", 4, 72, "Is the grey one available?", {
      tags: ["English"],
      account: "Morrow · 普通 Bot",
    }),
    person("lu", "陆远", "xiaohongshu", 5, 48, "这个尺寸是包含肩带的吗？", {
      tags: ["尺寸咨询"],
      messages: [
        msg(
          "lu-1",
          "商品编号 73082601 · 当前仅取得编号",
          "visitor",
          "unsupported",
          "14:28",
        ),
        msg("lu-2", "这个尺寸是包含肩带的吗？"),
      ],
    }),
    person(
      "lin-wx",
      "林小满",
      "wechat",
      null,
      32,
      "你好，我想咨询一下礼盒包装。",
      {
        tags: ["包装咨询"],
        note: "来自微信客服的独立访客，与小红书同名访客尚无关联证据。",
      },
    ),
    person(
      "evan",
      "Evan",
      "whatsapp",
      null,
      0,
      "Thanks, let me think about it.",
      {
        tags: ["回复受限"],
        replyOpen: false,
        firstVisit: "9 月 12 日 11:20",
        messages: [
          msg("evan-1", "Is there a larger size?", "visitor", "text", "09:15"),
          msg(
            "evan-2",
            "We have two sizes. The larger one fits a 15-inch laptop.",
            "agent",
            "text",
            "09:20",
          ),
          msg(
            "evan-3",
            "Thanks, let me think about it.",
            "visitor",
            "text",
            "09:22",
          ),
        ],
      },
    ),
    person("shen", "沈知夏", "wechat", 2, 0, "好的，明白了，谢谢。", {
      status: "waiting",
      unread: 0,
      tags: ["回访"],
      starred: true,
    }),
    person("he", "何麦", "douyin", 3, 0, "我再选一下颜色。", {
      status: "waiting",
      unread: 0,
      tags: ["颜色咨询"],
    }),
    person("zhao", "赵小雨", "wechat-mp", 1, 0, "稍等，我找一下照片。", {
      status: "waiting",
      unread: 0,
      tags: ["图片咨询"],
    }),
    person("song", "宋屿", "xiaohongshu", 4, 0, "好呀，我晚一点来。", {
      status: "waiting",
      unread: 0,
    }),
    person("tang", "唐可", "wechat", 5, 0, "收到，谢谢你的帮助！", {
      status: "ended",
      unread: 0,
      tags: ["已解答"],
    }),
  ];
}
