import type { ChannelId } from "@/lib/channels";

import type { ConnectionConfig } from "./api";
import { imTraits } from "./channel-traits-im";
import {
  type ChannelTrait,
  type ConfigOfChannel,
  hasText,
  type WireFormat,
} from "./channel-traits-model";
import { socialTraits } from "./channel-traits-social";
import { tradeTraits } from "./channel-traits-trade";

/**
 * 渠道描述表（per-channel traits）：每渠道一行，聚合该渠道全部接入点所需的
 * 属性——默认连接、凭证字段定义、必填集判定、回包信封形态、「验证连接」文案、
 * 通道/模式选择器定义。表是数据，消费点是通用逻辑：新增渠道 = 注册表加渠道
 * + 行集加一行，不再改任何共享分支。
 *
 * C1 深化的 seam（单文件 ≤ 500 行）：行按渠道家族拆分为 social/im/trade 三个
 * 行集文件（各为同一接口后的行集合，均只依赖 ./channel-traits-model，不互引）；
 * 本文件只做组装 + 查表 + 公共判定（url 前置 + fail-safe），不放任何渠道分支。
 * 初始占位连接表 DEFAULT_CONNECTIONS 由各行 defaultConnection 派生，不手写第二张表。
 * 公共 shapes（CHANNEL_REGISTRY / schemas registry）不在此动，留待 C6。
 */

export {
  DINGTALK_SYSTEMS,
  defaultBilibiliConnection,
  defaultDingtalkConnection,
  defaultFeishuConnection,
  defaultKuaishouConnection,
  defaultQqConnection,
  defaultTelegramConnection,
  defaultWeiboConnection,
  defaultWhatsappConnection,
  defaultXiaohongshuConnection,
  XIAOHONGSHU_SYSTEMS,
} from "./channel-traits-im";
export type {
  ChannelSelectorDef,
  ChannelSelectorOption,
  ChannelTrait,
  ConfigOfChannel,
  ConnectionFieldKey,
  CredentialField,
  WireFormat,
} from "./channel-traits-model";
export { hasText, setConnectionField } from "./channel-traits-model";
/** 行集默认连接的兼容重导出（旧 `../channel-defaults` 深导入改经此表） */
export {
  DOUYIN_SYSTEMS,
  defaultDouyinConnection,
  defaultWechatMiniConnection,
  defaultWechatMpConnection,
  defaultWecomConnection,
  WECHAT_MINI_DATA_FORMATS,
  WECHAT_MINI_MODES,
  WECHAT_MP_MODES,
  WECOM_SYSTEMS,
} from "./channel-traits-social";
export {
  defaultAlipayConnection,
  defaultElemeConnection,
  defaultJingdongConnection,
  defaultMeituanConnection,
  defaultPinduoduoConnection,
  defaultTaobaoConnection,
} from "./channel-traits-trade";

const CHANNEL_TRAITS = {
  ...socialTraits,
  ...imTraits,
  ...tradeTraits,
} as const satisfies { [C in ChannelId]: ChannelTrait<ConfigOfChannel<C>> };

/** 按渠道取接入描述（单点）：行内函数收窄配置类型，调用方传同渠道配置 */
export function channelTraits<C extends ChannelId>(
  channel: C,
): ChannelTrait<ConfigOfChannel<C>> {
  return CHANNEL_TRAITS[channel] as unknown as ChannelTrait<ConfigOfChannel<C>>;
}

/**
 * 初始占位连接表：由上表各行 defaultConnection 派生（slice 初始化铺开用）。
 * 派生而非手写——加渠道只改行集，不再同步第二张逐行表。
 */
export const DEFAULT_CONNECTIONS: Record<ChannelId, ConnectionConfig> =
  Object.fromEntries(
    (Object.entries(CHANNEL_TRAITS) as [ChannelId, ChannelTrait][]).map(
      ([channel, trait]) => [channel, trait.defaultConnection],
    ),
  ) as Record<ChannelId, ConnectionConfig>;

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

/**
 * 「已配置」的内容判定：直发前置条件，发送入口与指引展示共用。
 * 条目存在不等于已配置——按渠道核必填集，缺一即视为未配置
 * （含初始默认占位连接、仅存 url 未存凭据的半成品）。
 * 通用判定只保留两条公共规则：url 是全渠道公共前置（hasText 单点）；
 * 渠道内必填集查上表（各行 credentialReady 内部统一走 hasText，不再复核 url，
 * 飞书旧双重 url 检查已收敛到此一处）。注册表外渠道一律视为未配置。
 */
export function isConnectionReady(
  config: ConnectionConfig | undefined,
): config is ConnectionConfig {
  if (!config) {
    return false;
  }
  const trait = channelTraitOrNull(config.channel);
  if (!trait) {
    return false;
  }
  return hasText(config.url) && trait.credentialReady(config);
}
