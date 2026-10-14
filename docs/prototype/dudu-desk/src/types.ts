export type Variant = "A" | "C" | "D" | "E";
export type ChannelKey =
  | "xiaohongshu"
  | "wechat"
  | "douyin"
  | "whatsapp"
  | "telegram"
  | "wechat-mp";
export type ConversationStatus = "needs-reply" | "waiting" | "ended";
export type MessageKind =
  | "text"
  | "product"
  | "image"
  | "voice"
  | "file"
  | "unsupported";
export type Message = {
  id: string;
  role: "visitor" | "agent";
  kind: MessageKind;
  text: string;
  time: string;
  status?: "sending" | "sent" | "read" | "failed";
};
export type Visitor = {
  id: string;
  name: string;
  channel: ChannelKey;
  account: string;
  handle: string;
  avatar: number | null;
  color: string;
  status: ConversationStatus;
  unread: number;
  wait: number;
  tags: string[];
  note: string;
  source: string;
  firstVisit: string;
  phone?: string;
  location?: string;
  starred: boolean;
  replyOpen: boolean;
  messages: Message[];
};
export type Channel = {
  name: string;
  short: string;
  color: string;
  background: string;
};
export const channels: Record<ChannelKey, Channel> = {
  xiaohongshu: {
    name: "小红书小程序",
    short: "小红书",
    color: "#e6445c",
    background: "#fff0f2",
  },
  wechat: {
    name: "微信客服",
    short: "微信客服",
    color: "#22946b",
    background: "#eaf7f1",
  },
  douyin: {
    name: "抖音私信",
    short: "抖音",
    color: "#364054",
    background: "#edf0f5",
  },
  whatsapp: {
    name: "WhatsApp",
    short: "WhatsApp",
    color: "#258565",
    background: "#eaf6ee",
  },
  telegram: {
    name: "Telegram Bot",
    short: "Telegram",
    color: "#358bb5",
    background: "#edf6fc",
  },
  "wechat-mp": {
    name: "微信公众号",
    short: "公众号",
    color: "#419663",
    background: "#eff7ee",
  },
};
