import type { ChannelId } from "@/lib/channels";

/**
 * 事件模板（EventSchema）领域类型（模块化拆分自原 schemas.ts）：
 * 协议元数据（wire/xmlLayout/idGenerations/payload）与期望回执在此，
 * 字段说明（fields）与版本/来源由版本化渠道描述文件
 * （../definitions/<channel>.json）经带类型校验的 loader 加载，
 * 用户编辑的覆写走 definitions 域持久化，解析合并在 ../definitions/resolve。
 * 模板载荷逐字采用官方黄金样本（docs/research/channels/ 各渠道文档）。
 */

// FieldType 中的 numberString：数字串——值全程按字符串处理
// （如企微 MsgId 64 位整型，不经 number 不丢精度）
export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "json"
  | "numberString";

/** 新建事件时按官方形态生成的 ID 种类 */
export type IdKind =
  | "openId"
  | "encryptedId"
  | "logId"
  | "createTimeMs" // 抖音 13 位毫秒时间戳
  | "createTimeSec" // 企微 10 位秒级时间戳（字符串）
  | "createTimeSecNumber" // 10 位秒级时间戳（数字形态：小游戏 CreateTime 等）
  | "msgId64" // 企微 MsgId：64 位整型数字串（18 位，恒在 int64 内）
  | "aibotMsgId"; // 企微智能机器人 msgid：base64 风格串（官方样本 31 字符 + "="）

export type FieldDescriptor = {
  /** 报文内的点路径，数组用 [index] */
  path: string;
  title: string;
  type: FieldType;
  group: string;
  description: string;
  required?: boolean;
  format?: "url";
  multiline?: boolean;
};

/** 一条 ID 生成规则：sameAs 声明与哪个路径共用同一生成值 */
export type IdGeneration = {
  path: string;
  kind: IdKind;
  sameAs?: string;
};

export type WirePayload = { [key: string]: unknown };

/** 报文的线上形态：抖音 JSON、企微 XML（决定拼装/解析方式） */
export type WireForm = "json" | "xml";

/** 期望回执的正文形态：包含 / 完全一致 / JSON 字段子集匹配 / 企微回执形态 */
export type ReceiptBodyMode =
  | "contains"
  | "equals"
  | "jsonField"
  | "wecomReply";

export type ExpectedReceipt = {
  status: number;
  /** 期望正文（空 = 不校验正文，只看状态码） */
  body: string;
  bodyMode: ReceiptBodyMode;
};

/**
 * 企微 XML 载荷的确定性拼装规则（逐字复现官方样本的排版）：
 * - indent：元素行的缩进前缀（官方消息样本 §5.2 用三空格、事件样本 §5.3/§5.4 用 tab）
 * - bareTags：裸文本输出的元素（官方样本中 CreateTime/MsgId/AgentID 不带 CDATA）
 * - trailingSpaceTags：闭合标签后带一个空格的元素（§5.2 FromUserName 行官方原文如此）
 */
export type XmlLayout = {
  indent: string;
  bareTags: readonly string[];
  trailingSpaceTags?: readonly string[];
};

export type EventSchema = {
  id: string;
  channelId: ChannelId;
  /** 信封 event 字段的官方事件名 */
  eventName: string;
  name: string;
  kind: "message" | "event";
  /** 描述符版本标识（来自渠道描述文件条目） */
  version: string;
  /** 字段定义来源（官方文档 URL，来自渠道描述文件条目） */
  source: string;
  /** content 在线上是 JSON 字符串（im_enter_direct_msg） */
  contentString: boolean;
  /** 线上报文形态：决定 wireBodyText 拼装与完整报文页解析 */
  wire: WireForm;
  /** wire = xml 时的确定性拼装规则 */
  xmlLayout?: XmlLayout;
  /** 字段定义（来自渠道描述文件条目；用户覆写见 definitions/resolve） */
  fields: FieldDescriptor[];
  /** 新建事件时需要按官方形态重新生成的 ID 路径 */
  idGenerations: IdGeneration[];
  /** 模板载荷：官方黄金样本原文 */
  payload: WirePayload;
  /** 渠道真实默认期望回执：草稿创建时带入（状态码 + 正文形态） */
  expected: ExpectedReceipt;
};

/** 协议元数据（渠道模块声明的部分）：id/channelId/version/source/fields 由聚合侧补齐 */
export type SchemaProtocol = Omit<
  EventSchema,
  "id" | "channelId" | "version" | "source" | "fields"
>;
