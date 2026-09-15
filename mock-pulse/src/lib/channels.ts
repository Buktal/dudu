import type { LucideIcon } from "lucide-react";
import {
  AtSign,
  Bike,
  Bird,
  Bot,
  Heart,
  MessagesSquare,
  Music2,
  Newspaper,
  Package,
  Phone,
  Send,
  ShoppingCart,
  Smartphone,
  Tv,
  Users,
  Utensils,
  Video,
  Wallet,
  Zap,
} from "lucide-react";

/**
 * 渠道注册表：全量锚定渠道事实库（docs/research/channels/，ADR-0008）。
 * 20 渠道中具备 HTTP(S) 回调形态的 19 个全部入表；淘宝取全球栈 HTTPS 回调
 * 子形态并带「全球栈」标注，知乎无推送可 mock、不入表。
 * 渠道标识（ChannelId）由注册表键派生——新增渠道 = 加一行数据，
 * 不再维护封闭的字面量联合类型，也不散落类型分支判断。
 */

/** 图标取值表：行数据只存键，组件表集中在此 */
const CHANNEL_ICONS = {
  Music2,
  MessagesSquare,
  Heart,
  Bird,
  AtSign,
  Newspaper,
  Smartphone,
  Zap,
  Bot,
  ShoppingCart,
  Package,
  Users,
  Bike,
  Utensils,
  Tv,
  Video,
  Wallet,
  Phone,
  Send,
} as const satisfies Record<string, LucideIcon>;

type ChannelIconKey = keyof typeof CHANNEL_ICONS;

/** 注册表一行的形态：键即渠道 id，行内只放展示与能力元数据 */
export type ChannelRow = {
  /** 展示名（渠道选择器 / 连接列表共用） */
  name: string;
  /** 协议一句话（连接列表描述行） */
  protocol: string;
  /** 报文形态与验签事实（锚定事实库对应文档） */
  note: string;
  /** 渠道标识图形（图标键，经 CHANNEL_ICONS 解析为组件） */
  icon: ChannelIconKey;
  /** 连接适配器（握手/直发/回执投影）是否已实现；未实现渠道仅在选择器可见 */
  implemented: boolean;
  /** 同平台多接入体系时取 HTTP 回调子形态的「全球栈」标注（仅淘宝） */
  globalStack?: boolean;
};

export const CHANNEL_REGISTRY = {
  douyin: {
    name: "抖音",
    protocol: "四套推送体系 · JSON 回调",
    note: "dop/生活服务 X-Douyin-Signature=sha1(secret+body)，小游戏 x-signature=base64(md5)，服务商 MsgSignature 信封，按连接推送体系路由",
    icon: "Music2",
    implemented: true,
  },
  wecom: {
    name: "企业微信",
    protocol: "自建应用 XML · 智能机器人 JSON",
    note: "自建应用 XML 与智能机器人 JSON 双通道：GET echostr 握手 + AES 信封（机器人 receiveid 为空串），按连接推送通道路由",
    icon: "MessagesSquare",
    implemented: true,
  },
  xiaohongshu: {
    name: "小红书",
    protocol: "小程序客服 + 电商 ark · JSON 回调",
    note: "双体系：小程序客服消息 GET echostr 握手 + AES 加密信封（MsgSignature 在 body 内，回 success）；电商 ark POST JSON 数组明文，回 {success:true,error_code:0}",
    icon: "Heart",
    implemented: true,
  },
  feishu: {
    name: "飞书",
    protocol: "Webhook · JSON 回调（JSON v2.0 信封）",
    note: "事件订阅 Webhook：POST challenge 握手原样回显（1s），X-Lark-Signature = sha256(timestamp+nonce+encrypt_key+body)，AES-256-CBC 加密信封（key=sha256(encrypt_key)）",
    icon: "Bird",
    implemented: true,
  },
  weibo: {
    name: "微博",
    protocol: "粉服 Webhook · JSON 回调",
    note: "粉丝服务平台 Webhook：JSON 报文（可切微信 XML），GET 握手回 echostr，sha1(排序(appsecret,timestamp,nonce))",
    icon: "AtSign",
    implemented: true,
  },
  "wechat-mp": {
    name: "微信公众号",
    protocol: "公众号 · XML 回调",
    note: "公众号推送仅 XML：GET 三参 sha1 校验并原样回 echostr，明文/兼容/安全三模式",
    icon: "Newspaper",
    implemented: true,
  },
  "wechat-mini": {
    name: "微信小程序",
    protocol: "小程序 · XML 回调（XML/JSON 可选取 XML 为主）",
    note: "小程序消息推送：GET 握手同公众号（原样回 echostr），明文/兼容/安全三模式 AES 同族，客服三包 + 进入会话与授权变更事件，回 success/空串",
    icon: "Smartphone",
    implemented: true,
  },
  dingtalk: {
    name: "钉钉",
    protocol: "HTTP 回调 · 加密 JSON 信封 / 机器人明文 JSON",
    note: "新 HTTP 密文信封：大写事件 + sha1 四参验签 + AES-CBC（PKCS#7-32），1500ms 回加密 success 包；机器人收消息明文 6 msgtype，timestamp/sign = HmacSHA256 头",
    icon: "Zap",
    implemented: true,
  },
  qq: {
    name: "QQ 机器人",
    protocol: "Webhook · JSON 回调",
    note: "QQ 机器人 Webhook：JSON 报文，op13 验证 + Ed25519 签名，无 AES",
    icon: "Bot",
    implemented: true,
  },
  taobao: {
    name: "淘宝/天猫",
    protocol: "全球栈 · HTTPS 回调",
    note: "国内 TOP 无 HTTP 回调（TMC 长连接不模拟），取全球栈 HTTPS 回调：HMAC-SHA256 验签，回 200 签收（500ms/半小时/12 次重试语义）",
    icon: "ShoppingCart",
    implemented: true,
    globalStack: true,
  },
  jingdong: {
    name: "京东",
    protocol: "JOS · 消息推送",
    note: "JOS 消息推送：MD5(secret+字母序+secret) 签名，timestamp 10 分钟窗口",
    icon: "Package",
    implemented: true,
  },
  pinduoduo: {
    name: "拼多多",
    protocol: "PMC 订阅推送 · JSON 回调",
    note: "订阅后主动推（permit/cancel 开通订阅）：签名 UPPER(MD5(secret+ASCII 排序 kv+secret)) 官方向量已核验，access_token 放参数集参签，订单三态 1-待发货/2-已发货/3-已签收",
    icon: "Users",
    implemented: true,
  },
  meituan: {
    name: "美团",
    protocol: "合作中心 · 表单回调",
    note: "技术服务合作中心回调：form-urlencoded 表单，签名 MD5(url?字母序+secret)，2 秒内回 ok",
    icon: "Bike",
    implemented: false,
  },
  eleme: {
    name: "饿了么",
    protocol: "用户线 · JSON 推送",
    note: "用户线推送：SHA1 五步签名（sig 作 Query），200+ok 双确认，无 token 无加密",
    icon: "Utensils",
    implemented: false,
  },
  bilibili: {
    name: "B站",
    protocol: "Webhooks · HTTPS 回调",
    note: "开放平台 Webhooks：HTTPS POST，HMAC-SHA256 验签，封闭 4 事件",
    icon: "Tv",
    implemented: false,
  },
  kuaishou: {
    name: "快手",
    protocol: "开放域 Webhook + 支付回调族 · JSON 回调",
    note: "双判型信封：开放域 event 判型（TEST/AUTHORIZE/UN_AUTHORIZE）+ 支付族 biz_type 判型，kwaisign = MD5(body+secret) 头验签无 AES，应答 200 + result=1",
    icon: "Video",
    implemented: true,
  },
  alipay: {
    name: "支付宝",
    protocol: "异步通知 · 表单回调",
    note: "异步通知回 notify_url：表单 POST，RSA2 验签，验签通过须回 success",
    icon: "Wallet",
    implemented: false,
  },
  whatsapp: {
    name: "WhatsApp",
    protocol: "Webhook · JSON 回调",
    note: "Cloud API Webhook：JSON 报文，GET 三参握手 200 裸回 challenge，X-Hub-Signature-256 = HMAC-SHA256(AppSecret, body)",
    icon: "Phone",
    implemented: false,
  },
  telegram: {
    name: "Telegram",
    protocol: "Webhook · JSON Update",
    note: "Bot Webhook：JSON Update，恒等头 X-Telegram-Bot-Api-Secret-Token 原样比对，无 HMAC",
    icon: "Send",
    implemented: false,
  },
} as const satisfies Record<string, ChannelRow>;

/** 渠道标识：由注册表键派生（新增渠道自动扩展，无需改类型） */
export type ChannelId = keyof typeof CHANNEL_REGISTRY;

/** 注册表中的一条渠道：id + 行元数据（图标键已解析为组件） */
export type Channel = Omit<ChannelRow, "icon"> & {
  id: ChannelId;
  icon: LucideIcon;
};

/** 展示序与注册表声明序一致（对象字符串键按插入序遍历） */
export const CHANNELS: readonly Channel[] = Object.entries(
  CHANNEL_REGISTRY,
).map(([id, row]) => {
  const { icon, ...rest } = row;
  return {
    id: id as ChannelId,
    ...rest,
    icon: CHANNEL_ICONS[icon],
  };
});

const CHANNELS_BY_ID = new Map<string, Channel>(
  CHANNELS.map((channel) => [channel.id, channel]),
);

export function isChannelId(value: unknown): value is ChannelId {
  return typeof value === "string" && CHANNELS_BY_ID.has(value);
}

export function channelById(id: string): Channel | undefined {
  return CHANNELS_BY_ID.get(id);
}
