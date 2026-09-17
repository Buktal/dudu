import type { ChannelId } from "@/lib/channels";

import type { ConnectionConfig } from "./api";

/**
 * 渠道描述表的共享模型（C1 深化的地基）：窄接口 + 唯一非空规则 + 类型化编辑。
 * trait 行按渠道家族拆分（social/im/trade 三个行集文件，均只依赖本文件，
 * 不互引；组装与查表收敛在 ./channel-traits），新增渠道 = 行集加一行。
 * 单文件 ≤ 500 行的 seam 即渠道家族，行集始终是“同一接口后的行集合”。
 */

/** 按渠道字面量取对应形状的连接配置类型 */
export type ConfigOfChannel<C extends ChannelId> = Extract<
  ConnectionConfig,
  { channel: C }
>;

/**
 * 全渠道可编辑键的并集（排除 channel 判别字）：凭证键 + url + system/mode/
 * dataFormat 选择键。CredentialField.key 与编辑回调共用此并集，替代散落的
 * `(key: string, ...)` + 调用方 `as ConnectionConfig` 展开。
 */
export type ConnectionFieldKey = {
  [C in ChannelId]: Exclude<keyof ConfigOfChannel<C>, "channel">;
}[ChannelId];

/** 表单字段的构建形态：key 对应配置字段名，secret 走掩码输入 */
export type CredentialField = {
  key: ConnectionFieldKey;
  label: string;
  note: string;
  value: string;
  secret: boolean;
};

/** 选择器单个选项（取值与 Rust 端各体系枚举的 snake_case 内标一致） */
export type ChannelSelectorOption = {
  value: string;
  label: string;
};

/**
 * 通道/模式选择器定义（静态数据，随行）：wechat-mini 有两行（mode +
 * dataFormat），其余至多一行，无选择器的渠道为空数组。connection-fields
 * 只按此表渲染，不再写渠道级联。
 */
export type ChannelSelectorDef = {
  key: ConnectionFieldKey;
  label: string;
  hint: string;
  options: readonly ChannelSelectorOption[];
};

/** 回包信封形态标注（连接卡片徽标；文案即展示值） */
export type WireFormat = "JSON" | "XML" | "表单";

/**
 * 单渠道的接入描述。行内函数按该渠道的窄配置类型声明（表按键索引保证
 * 调用方传入的配置与渠道一致），对外经 channelTraits 统一放宽为
 * ConnectionConfig。selectors 为静态表（选项顺序即展示序）。
 */
export type ChannelTrait<C extends ConnectionConfig = ConnectionConfig> = {
  /** 原型默认连接（初始占位与表单回退共用） */
  defaultConnection: C;
  /** 凭证字段定义（表单渲染顺序即数组顺序；secret 走掩码控件） */
  credentialFields: (draft: C) => CredentialField[];
  /** url 之外的渠道内必填集（直发前置判定的渠道半边；内部统一走 hasText） */
  credentialReady: (draft: C) => boolean;
  /** 回包信封形态标注（随推送通道分流的渠道用函数，如企微双通道） */
  wireFormat: WireFormat | ((draft: C) => WireFormat);
  /** 「验证连接」卡片说明文案 */
  testNote: (draft: C) => string;
  /** 通道/模式选择器（无则空数组；wechat-mini 两行） */
  selectors: readonly ChannelSelectorDef[];
};

/**
 * 唯一的非空判定：url 与全部凭据共用 trim 规则，空白串一律视为未填。
 * 收敛前各 readiness 谓词 trim 口径不一（douyin/wecom/wechat 系用 `!== ""`，
 * 其余用 trim），atasan 已统一到此函数；行为变更见 channel-traits-trim 测试。
 */
export function hasText(value: string): boolean {
  return value.trim() !== "";
}

/**
 * 类型化编辑单点：connections-view/connection-fields 共用；语义与
 * `{...draft, [key]: value}` 等价，键合法性由调用方经 trait 行保证
 *（字段键/选择键/url 三类均在 ConnectionFieldKey 并集内）。
 */
export function setConnectionField<C extends ChannelId>(
  draft: ConfigOfChannel<C>,
  key: ConnectionFieldKey,
  value: string,
): ConfigOfChannel<C> {
  return { ...draft, [key]: value } as ConfigOfChannel<C>;
}
