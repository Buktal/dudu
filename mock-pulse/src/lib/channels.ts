export type Channel = {
  id: "douyin" | "wecom";
  name: string;
  protocol: string;
  note: string;
  implemented: boolean;
};

/**
 * 渠道注册表：首发只有抖音与企业微信。
 * 其他渠道（钉钉、QQ、公众号等）在研究文档中评估过，但不在首发范围。
 */
export const CHANNELS: readonly Channel[] = [
  {
    id: "douyin",
    name: "抖音",
    protocol: "dop · JSON 回调",
    note: "抖音开放平台 Webhooks：JSON 报文，X-Douyin-Signature = sha1(client_secret + body)",
    implemented: true,
  },
  {
    id: "wecom",
    name: "企业微信",
    protocol: "自建应用 · XML 回调",
    note: "企业微信自建应用回调：XML 报文，GET echostr 握手校验 Token/EncodingAESKey",
    implemented: true,
  },
] as const;

export type ChannelId = Channel["id"];

const CHANNEL_IDS: readonly ChannelId[] = CHANNELS.map((channel) => channel.id);

export function isChannelId(value: unknown): value is ChannelId {
  return typeof value === "string" && CHANNEL_IDS.includes(value as ChannelId);
}

export function channelById(id: string): Channel | undefined {
  return CHANNELS.find((channel) => channel.id === id);
}
