import type { ChannelId } from "@/lib/channels";

import { schemaDefinition } from "./definitions/loader";

/**
 * 渠道事件描述符（协议元数据）：wire/xmlLayout/idGenerations/payload 模板在此，
 * 字段说明（fields）与版本/来源由版本化渠道描述文件
 * ./definitions/douyin.json、wecom.json 经带类型校验的 loader 加载（#22），
 * 用户编辑的覆写走 definitions 域持久化，解析合并在 ./definitions/resolve。
 * 模板载荷逐字采用官方黄金样本
 * （docs/research/channels/douyin.md §5.7/§5.10/§5.11/§5.13、wecom.md §5.2）。
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
  | "msgId64"; // 企微 MsgId：64 位整型数字串（18 位，恒在 int64 内）

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
};

type SchemaProtocol = Omit<
  EventSchema,
  "id" | "channelId" | "version" | "source" | "fields"
>;

/** 协议元数据 + 描述文件条目 → 完整 EventSchema（version/source/fields 同源于文件） */
function defineSchema(
  channelId: ChannelId,
  id: string,
  protocol: SchemaProtocol,
): EventSchema {
  const definition = schemaDefinition(id);
  return {
    id,
    channelId,
    version: definition.version,
    source: definition.source,
    fields: definition.fields,
    ...protocol,
  };
}

/** 信封 + 会话 + 资料的 ID 生成规则（文本/图片/进入会话共用；
 *  仅对模板载荷中已存在的路径生效，见 applyGeneratedIds） */
function dyMessageIdGenerations(): IdGeneration[] {
  return [
    { path: "from_user_id", kind: "openId" },
    { path: "to_user_id", kind: "openId" },
    { path: "log_id", kind: "logId" },
    { path: "content.conversation_short_id", kind: "encryptedId" },
    { path: "content.server_message_id", kind: "encryptedId" },
    { path: "content.create_time", kind: "createTimeMs" },
    {
      path: "content.user_infos[0].open_id",
      kind: "openId",
      sameAs: "from_user_id",
    },
    {
      path: "content.user_infos[1].open_id",
      kind: "openId",
      sameAs: "to_user_id",
    },
  ];
}

/** 官方黄金样本 §5.10：IM 文本消息完整示例（含 user_infos，逐字；log_id 官方示例未携带，由生成规则补齐） */
const goldenDyText: WirePayload = {
  event: "im_receive_msg",
  client_key: "asdfavetgbvasf",
  from_user_id: "aaa-ae9b-4dbf-add1-bf67e4093fab",
  to_user_id: "aaa-7ae0-4399-914a-5eb1df5861ba",
  content: {
    conversation_short_id:
      "@9Vxc1/yDU8sqaS+gN4koEc7912foPPiLPZVyrQmgKVQabPH460zdRmYqig357zEBMaXjKvvhvwY02ISB7llsWQ==",
    server_message_id:
      "@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAPpF2rgykLFgbafb560zdRmYqig357zEBmWXVPshhwyd/y/7BQpXy/w==",
    conversation_type: 1,
    create_time: 1681303285997,
    message_type: "text",
    source: "",
    text: "捷途70",
    index: "1672502407220000",
    user_infos: [
      {
        open_id: "aaa-ae9b-4dbf-add1-bf67e4093fab",
        nick_name: "刘东",
        avatar:
          "https://p3.douyinpic.com/aweme/720x720/xxxxx-avatar/mosaic-legacy_3795_3047680722.jpeg?from=3782654143",
      },
      {
        open_id: "aaa-7ae0-4399-914a-5eb1df5861ba",
        nick_name: "毕节--捷途万丰店",
        avatar:
          "https://p3.douyinpic.com/aweme/720x720/xxxxxx-avatar/tos-cn-avt-0015_6c9ae9afb4e62e2263f98809e3dc5b6a.jpeg?from=3782654143",
      },
    ],
  },
};

/** 官方黄金样本 §5.7：IM 图片消息（无 text 字段，逐字） */
const goldenDyImage: WirePayload = {
  event: "im_receive_msg",
  client_key: "asdfavetgbvasf",
  from_user_id: "ac6479a5-d7a6-4018-84be-c29bfc00000",
  to_user_id: "8067f050-f8cf-4fa3-9357-c29bfc00000",
  content: {
    conversation_short_id:
      "@c29bfc000+MNggFhRkwGuX1ntuc0QfA0VnmRejrzWUBwDdDYrU9MpJSYEVV6/2hKU0il5iay8J99+0t5j3zrbA==",
    server_message_id:
      "@c29bfc000+MNggFhRkwGuX1ntuc0RPc0VHKefj/yWEJ8DtjUrU9MpJSYEVV6/2hKrOcqY1gIxctCXW23v4oW/Q==",
    conversation_type: 1,
    create_time: 1656571939562,
    message_type: "image",
    index: "1672502407220000",
  },
};

/** 官方黄金样本 §5.11：im_enter_direct_msg（content 为 json 字符串，逐字） */
const goldenDyEnter: WirePayload = {
  event: "im_enter_direct_msg",
  client_key: "aaaoqobz68a71u1",
  from_user_id: "aaa-8a0b-4c0f-b04f-feba0e909113",
  to_user_id: "aaa-81ec-424c-b738-8693eeaf53ea",
  content:
    '{"conversation_short_id":"@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAOJNyrA+nLFAba/f760zdRmYqig357zEBFWIIcsZD6/UJHKbF2JNw4w==","server_message_id":"@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAPZd5qgKuL1UVbfj460zdRmYqig357zEBi2hwzcxjeRsR2HorFuOHvA==","conversation_type":1,"create_time":1681303286088,"scene_type":4,"user_infos":[{"open_id":"xxxx8a0b-4c0f-b04f-feba0e909113","nick_name":"Hs姝羽","avatar":"https://p6.douyinpic.com/aweme/720x720/xxxx/tos-cn-i-0813_f2c60a21b05d43e68dd6daffd7d5d733.jpeg?from=3782654143"},{"open_id":"xxxx-81ec-424c-b738-8693eeaf53ea","nick_name":"广汽传祺张掖华逸店","avatar":"https://p6.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813_5d0c96b34bcc4068bb6f9f43b604448a.jpeg?from=3782654143"}],"data-im-extra":"123456789","query":"cptName=button","path":"page/componentTpl/componentTpl"}',
};

/** 官方黄金样本 §5.13：im_message_read（逐字） */
const goldenDyRead: WirePayload = {
  event: "im_message_read",
  client_key: "ttddf8ab4542c7d76601",
  from_user_id: "_000f9pF8lTroNtA9pfLjPohf1qIUzLdiWRs",
  to_user_id: "_000bfeGRgbkwDMMksxyg4auRqXAPGIZk1pl",
  content: {
    conversation_short_id:
      "@4F8A0vXKXctkaiPzY485F6f81WSGOvmFOJB3rwivKFMQaPT00HDnemIujgn96zUFraoX3c4RU8SOd4uRCKWmdg==",
    index: "1672502407220000",
    conversation_type: 1,
    read_open_id: "_000bfeGRgbkwDMMksxyg4auRqXAPGIZk1pl",
  },
};

export const DOUYIN_EVENT_SCHEMAS: readonly EventSchema[] = [
  defineSchema("douyin", "dy-text", {
    eventName: "im_receive_msg",
    name: "接收私信 · 文本",
    kind: "message",
    contentString: false,
    wire: "json",
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyText,
  }),
  defineSchema("douyin", "dy-image", {
    eventName: "im_receive_msg",
    name: "接收私信 · 图片",
    kind: "message",
    contentString: false,
    wire: "json",
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyImage,
  }),
  defineSchema("douyin", "dy-enter", {
    eventName: "im_enter_direct_msg",
    name: "进入私信会话",
    kind: "event",
    contentString: true,
    wire: "json",
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyEnter,
  }),
  defineSchema("douyin", "dy-read", {
    eventName: "im_message_read",
    name: "私信已读",
    kind: "event",
    contentString: false,
    wire: "json",
    // 已读事件无 user_infos，身份组由发送者与已读用户构成（字段集见描述文件）
    idGenerations: [
      { path: "from_user_id", kind: "openId" },
      { path: "to_user_id", kind: "openId" },
      { path: "log_id", kind: "logId" },
      { path: "content.conversation_short_id", kind: "encryptedId" },
      { path: "content.create_time", kind: "createTimeMs" },
      { path: "content.read_open_id", kind: "openId", sameAs: "to_user_id" },
    ],
    payload: goldenDyRead,
  }),
] as const;

// ---- 企业微信（自建应用回调，XML 报文）----
// 载荷与协议事实：docs/research/channels/wecom.md（官方 90239/90240 摄取）。
// 载荷模型：扁平对象，键 = XML 元素名（文档序）；MsgId 64 位整型全程按字符串处理。

/** 事件类排版：§5.3/§5.4 官方事件样本（tab 缩进、无行尾空格） */
const wcEventLayout: XmlLayout = {
  indent: "\t",
  bareTags: ["CreateTime", "MsgId", "AgentID"],
};

/** 官方黄金样本 §5.2：文本消息（逐字，MsgId 按字符串保真） */
const goldenWcText: WirePayload = {
  ToUserName: "toUser",
  FromUserName: "fromUser",
  CreateTime: "1348831860",
  MsgType: "text",
  Content: "this is a test",
  MsgId: "1234567890123456",
  AgentID: "1",
};

export const WECOM_EVENT_SCHEMAS: readonly EventSchema[] = [
  defineSchema("wecom", "wc-text", {
    eventName: "text",
    name: "接收消息 · 文本",
    kind: "message",
    contentString: false,
    wire: "xml",
    xmlLayout: {
      indent: "   ",
      bareTags: ["CreateTime", "MsgId", "AgentID"],
      // §5.2 官方原文 FromUserName 行尾带一个空格——逐字保真
      trailingSpaceTags: ["FromUserName"],
    },
    idGenerations: [
      { path: "CreateTime", kind: "createTimeSec" },
      { path: "MsgId", kind: "msgId64" },
    ],
    payload: goldenWcText,
  }),
  defineSchema("wecom", "wc-enter", {
    eventName: "enter_agent",
    name: "进入应用会话",
    kind: "event",
    contentString: false,
    wire: "xml",
    xmlLayout: wcEventLayout,
    idGenerations: [{ path: "CreateTime", kind: "createTimeSec" }],
    payload: {
      ToUserName: "toUser",
      FromUserName: "UserID",
      CreateTime: "1348831860",
      MsgType: "event",
      Event: "enter_agent",
      EventKey: "",
      AgentID: "1",
    },
  }),
  defineSchema("wecom", "wc-click", {
    eventName: "click",
    name: "点击菜单按钮",
    kind: "event",
    contentString: false,
    wire: "xml",
    xmlLayout: wcEventLayout,
    idGenerations: [{ path: "CreateTime", kind: "createTimeSec" }],
    payload: {
      ToUserName: "toUser",
      FromUserName: "UserID",
      CreateTime: "1348831860",
      MsgType: "event",
      Event: "click",
      EventKey: "EVENTKEY",
      AgentID: "1",
    },
  }),
] as const;

const SCHEMA_BY_ID = new Map<string, EventSchema>(
  [...DOUYIN_EVENT_SCHEMAS, ...WECOM_EVENT_SCHEMAS].map((schema) => [
    schema.id,
    schema,
  ]),
);

export function schemaById(id: string): EventSchema {
  const found = SCHEMA_BY_ID.get(id);
  if (!found) {
    throw new Error(`未知事件模板：${id}`);
  }
  return found;
}
