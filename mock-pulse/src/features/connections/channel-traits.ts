import type { ChannelId } from "@/lib/channels";

import type { ConnectionConfig } from "./api";
import {
  bilibiliFields,
  type CredentialField,
  dingtalkFields,
  douyinFields,
  feishuFields,
  kuaishouFields,
  qqFields,
  telegramFields,
  wechatMiniFields,
  wechatMpFields,
  wecomFields,
  weiboFields,
  whatsappFields,
  xiaohongshuFields,
} from "./channel-credentials";
import {
  alipayFields,
  elemeFields,
  jingdongFields,
  meituanFields,
  pinduoduoFields,
  taobaoFields,
} from "./channel-credentials-trade";
import {
  defaultAlipayConnection,
  defaultBilibiliConnection,
  defaultDingtalkConnection,
  defaultDouyinConnection,
  defaultElemeConnection,
  defaultFeishuConnection,
  defaultJingdongConnection,
  defaultKuaishouConnection,
  defaultMeituanConnection,
  defaultPinduoduoConnection,
  defaultQqConnection,
  defaultTaobaoConnection,
  defaultTelegramConnection,
  defaultWechatMiniConnection,
  defaultWechatMpConnection,
  defaultWecomConnection,
  defaultWeiboConnection,
  defaultWhatsappConnection,
  defaultXiaohongshuConnection,
} from "./channel-defaults";
import {
  alipayTestNote,
  bilibiliTestNote,
  dingtalkTestNote,
  douyinTestNote,
  elemeTestNote,
  feishuTestNote,
  jingdongTestNote,
  kuaishouTestNote,
  meituanTestNote,
  pinduoduoTestNote,
  qqTestNote,
  taobaoTestNote,
  telegramTestNote,
  wechatMiniTestNote,
  wechatMpTestNote,
  wecomTestNote,
  weiboTestNote,
  whatsappTestNote,
  xiaohongshuTestNote,
} from "./channel-notes";
import {
  alipayReady,
  bilibiliReady,
  dingtalkReady,
  douyinSystemReady,
  elemeReady,
  feishuReady,
  jingdongReady,
  kuaishouReady,
  meituanReady,
  pinduoduoReady,
  qqReady,
  taobaoReady,
  telegramReady,
  wechatMiniReady,
  wechatMpReady,
  wecomSystemReady,
  weiboReady,
  whatsappReady,
  xiaohongshuReady,
} from "./channel-readiness";

/**
 * 渠道描述表（per-channel traits）：每渠道一行，聚合该渠道全部接入点所需的
 * 属性——凭证字段定义、必填集判定、默认连接、回包信封形态、「验证连接」文案。
 * 表是数据，消费点是通用逻辑：新增渠道 = 注册表加渠道 + 各数据模块加构建器
 * + 此表加一行，不再改任何共享分支（code-review 退件：消灭渠道 switch 级联）。
 */

/** 回包信封形态标注（连接卡片徽标；文案即展示值） */
export type WireFormat = "JSON" | "XML" | "表单";

/** 按渠道字面量取对应形状的连接配置类型 */
export type ConfigOfChannel<C extends ChannelId> = Extract<
  ConnectionConfig,
  { channel: C }
>;

/**
 * 单渠道的接入描述。行内函数按该渠道的窄配置类型声明（表按键索引保证
 * 调用方传入的配置与渠道一致），对外经 channelTraits 统一放宽为
 * ConnectionConfig。
 */
export type ChannelTrait<C extends ConnectionConfig = ConnectionConfig> = {
  /** 原型默认连接（初始占位与表单回退共用） */
  defaultConnection: C;
  /** 凭证字段定义（表单渲染顺序即数组顺序；secret 走掩码控件） */
  credentialFields: (draft: C) => CredentialField[];
  /** url 之外的渠道内必填集（直发前置判定的渠道半边） */
  credentialReady: (draft: C) => boolean;
  /** 回包信封形态标注（随推送通道分流的渠道用函数，如企微双通道） */
  wireFormat: WireFormat | ((draft: C) => WireFormat);
  /** 「验证连接」卡片说明文案 */
  testNote: (draft: C) => string;
};

const CHANNEL_TRAITS = {
  douyin: {
    defaultConnection: defaultDouyinConnection,
    credentialFields: douyinFields,
    credentialReady: douyinSystemReady,
    wireFormat: "JSON",
    testNote: (draft) => douyinTestNote(draft.system),
  },
  wecom: {
    defaultConnection: defaultWecomConnection,
    credentialFields: wecomFields,
    credentialReady: wecomSystemReady,
    wireFormat: (draft) => (draft.system === "aibot" ? "JSON" : "XML"),
    testNote: (draft) => wecomTestNote(draft.system),
  },
  xiaohongshu: {
    defaultConnection: defaultXiaohongshuConnection,
    credentialFields: xiaohongshuFields,
    credentialReady: xiaohongshuReady,
    wireFormat: "JSON",
    testNote: (draft) => xiaohongshuTestNote(draft.system),
  },
  "wechat-mp": {
    defaultConnection: defaultWechatMpConnection,
    credentialFields: wechatMpFields,
    credentialReady: wechatMpReady,
    wireFormat: "XML",
    testNote: (draft) => wechatMpTestNote(draft.mode),
  },
  "wechat-mini": {
    defaultConnection: defaultWechatMiniConnection,
    credentialFields: wechatMiniFields,
    credentialReady: wechatMiniReady,
    wireFormat: "XML",
    testNote: (draft) => wechatMiniTestNote(draft.mode),
  },
  feishu: {
    defaultConnection: defaultFeishuConnection,
    credentialFields: feishuFields,
    credentialReady: feishuReady,
    wireFormat: "JSON",
    testNote: feishuTestNote,
  },
  dingtalk: {
    defaultConnection: defaultDingtalkConnection,
    credentialFields: dingtalkFields,
    credentialReady: dingtalkReady,
    wireFormat: "JSON",
    testNote: (draft) => dingtalkTestNote(draft.system),
  },
  qq: {
    defaultConnection: defaultQqConnection,
    credentialFields: qqFields,
    credentialReady: qqReady,
    wireFormat: "JSON",
    testNote: qqTestNote,
  },
  weibo: {
    defaultConnection: defaultWeiboConnection,
    credentialFields: weiboFields,
    credentialReady: weiboReady,
    wireFormat: "JSON",
    testNote: weiboTestNote,
  },
  kuaishou: {
    defaultConnection: defaultKuaishouConnection,
    credentialFields: kuaishouFields,
    credentialReady: kuaishouReady,
    wireFormat: "JSON",
    testNote: kuaishouTestNote,
  },
  taobao: {
    defaultConnection: defaultTaobaoConnection,
    credentialFields: taobaoFields,
    credentialReady: taobaoReady,
    wireFormat: "JSON",
    testNote: taobaoTestNote,
  },
  jingdong: {
    defaultConnection: defaultJingdongConnection,
    credentialFields: jingdongFields,
    credentialReady: jingdongReady,
    wireFormat: "JSON",
    testNote: jingdongTestNote,
  },
  pinduoduo: {
    defaultConnection: defaultPinduoduoConnection,
    credentialFields: pinduoduoFields,
    credentialReady: pinduoduoReady,
    wireFormat: "JSON",
    testNote: pinduoduoTestNote,
  },
  meituan: {
    defaultConnection: defaultMeituanConnection,
    credentialFields: meituanFields,
    credentialReady: meituanReady,
    wireFormat: "表单",
    testNote: meituanTestNote,
  },
  eleme: {
    defaultConnection: defaultElemeConnection,
    credentialFields: elemeFields,
    credentialReady: elemeReady,
    wireFormat: "JSON",
    testNote: elemeTestNote,
  },
  bilibili: {
    defaultConnection: defaultBilibiliConnection,
    credentialFields: bilibiliFields,
    credentialReady: bilibiliReady,
    wireFormat: "JSON",
    testNote: bilibiliTestNote,
  },
  alipay: {
    defaultConnection: defaultAlipayConnection,
    credentialFields: alipayFields,
    credentialReady: alipayReady,
    wireFormat: "表单",
    testNote: alipayTestNote,
  },
  whatsapp: {
    defaultConnection: defaultWhatsappConnection,
    credentialFields: whatsappFields,
    credentialReady: whatsappReady,
    wireFormat: "JSON",
    testNote: whatsappTestNote,
  },
  telegram: {
    defaultConnection: defaultTelegramConnection,
    credentialFields: telegramFields,
    credentialReady: telegramReady,
    wireFormat: "JSON",
    testNote: telegramTestNote,
  },
} as const satisfies { [C in ChannelId]: ChannelTrait<ConfigOfChannel<C>> };

/** 按渠道取接入描述（单点）：行内函数收窄配置类型，调用方传同渠道配置 */
export function channelTraits<C extends ChannelId>(
  channel: C,
): ChannelTrait<ConfigOfChannel<C>> {
  // 行按 channel 键入（satisfies 穷尽校验），键与配置形状在这里对齐
  return CHANNEL_TRAITS[channel] as unknown as ChannelTrait<ConfigOfChannel<C>>;
}

/**
 * 运行时未知渠道（持久化文件混入注册表外 id）返回 undefined，调用方
 * fail-safe 处理——编译期穷尽由 CHANNEL_TRAITS 的 satisfies 保证。
 */
export function channelTraitOrNull(channel: string): ChannelTrait | undefined {
  if (typeof channel !== "string" || !(channel in CHANNEL_TRAITS)) {
    return undefined;
  }
  return CHANNEL_TRAITS[channel as ChannelId] as ChannelTrait;
}

/** 回包信封形态标注的取值单点（静态标注与按通道分流统一在此解析） */
export function channelWireFormat(
  channel: ChannelId,
  draft: ConnectionConfig,
): WireFormat {
  const format = channelTraits(channel).wireFormat;
  return typeof format === "function" ? format(draft) : format;
}
