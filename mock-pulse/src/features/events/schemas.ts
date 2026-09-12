import type { ChannelId } from "@/lib/channels";

/**
 * 渠道事件描述符（带版本标识的纯数据模块）。
 * 字段定义派生自原型 SCHEMAS；模板载荷逐字采用官方黄金样本
 * （docs/research/channels/douyin.md §5.7/§5.10/§5.11/§5.13）。
 * 编辑/导入导出在 #9 落地，本模块只读。
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
  /** 描述符版本标识 */
  version: string;
  /** 字段定义来源（官方文档 URL） */
  source: string;
  /** content 在线上是 JSON 字符串（im_enter_direct_msg） */
  contentString: boolean;
  /** 线上报文形态：决定 wireBodyText 拼装与完整报文页解析 */
  wire: WireForm;
  /** wire = xml 时的确定性拼装规则 */
  xmlLayout?: XmlLayout;
  fields: FieldDescriptor[];
  /** 新建事件时需要按官方形态重新生成的 ID 路径 */
  idGenerations: IdGeneration[];
  /** 模板载荷：官方黄金样本原文 */
  payload: WirePayload;
};

const SOURCE_PRIVATE_MSG =
  "https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/private-msg-webhook";
const SOURCE_ENTER_DIRECT =
  "https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/enter-direct-msg-webhook";
const SOURCE_MESSAGE_READ =
  "https://developer.open-douyin.com/docs/resource/zh-CN/mini-app/develop/server/reach-marketing/instant-message/private-message/message-read-webhook";

const field = (
  path: string,
  title: string,
  description: string,
  group: string,
  type: FieldType = "string",
  extra: Partial<FieldDescriptor> = {},
): FieldDescriptor => ({ path, title, description, group, type, ...extra });

/** 发送用户 ID：私信类与已读事件的身份组共用（必填） */
const dySenderField = field(
  "from_user_id",
  "发送用户 ID",
  "发送方的 open_id。用它区分新客、老客，或模拟不同用户。",
  "用户与身份",
  "string",
  { required: true },
);

const dyIdentity: FieldDescriptor[] = [
  dySenderField,
  field(
    "content.user_infos[0].nick_name",
    "用户昵称",
    "对方的展示名称；修改后可检查你的服务如何更新用户资料。",
    "用户与身份",
  ),
  field(
    "content.user_infos[0].avatar",
    "用户头像",
    "头像地址。改变此值可模拟头像变更，或填写无效地址检查兜底。",
    "用户与身份",
    "string",
    { format: "url" },
  ),
  field(
    "content.user_infos[0].open_id",
    "资料对应的用户 ID",
    "这份昵称与头像属于谁。通常与发送用户 ID 一致；也可独立修改以测试异常。",
    "用户与身份",
  ),
];

const dyEnvelope: FieldDescriptor[] = [
  field(
    "event",
    "事件名称",
    "平台原始事件名。当前说明按所选事件类型提供。",
    "回调信封",
  ),
  field(
    "to_user_id",
    "接收用户 ID",
    "接收私信的企业号 open_id。它与发送用户是两个不同身份。",
    "回调信封",
  ),
  field(
    "client_key",
    "应用标识",
    "接收该回调的抖音应用 client_key。",
    "回调信封",
  ),
  field(
    "log_id",
    "推送日志 ID",
    "平台推送的追踪标识。重放同一条时可保留原值。",
    "回调信封",
  ),
];

const dyConversation: FieldDescriptor[] = [
  field(
    "content.conversation_short_id",
    "会话 ID",
    "同一个会话保持相同 ID，便于模拟连续对话。",
    "会话与时序",
  ),
  field(
    "content.server_message_id",
    "消息 ID",
    "这条消息的唯一标识。使用同值可构造重复消息。",
    "会话与时序",
  ),
  field(
    "content.conversation_type",
    "会话类型",
    "1 表示私聊；按平台文档设置对应类型。",
    "会话与时序",
    "number",
  ),
  field(
    "content.create_time",
    "消息时间",
    "13 位 Unix 毫秒时间戳；与企业微信的秒级时间不同。",
    "会话与时序",
    "number",
  ),
  field(
    "content.index",
    "消息序号",
    "同会话内逐条递增，用于与已读事件对齐。",
    "会话与时序",
    "number",
  ),
  field(
    "content.source",
    "消息来源",
    "客户端主动发送时为空；通过接口发送时是相应应用标识。",
    "会话与时序",
  ),
];

/** 信封 + 会话 + 资料的 ID 生成规则（文本/图片/进入会话共用；
 *  仅对模板载荷中已存在的路径生效，见 applyGeneratedIds） */
const dyMessageIdGenerations = (): IdGeneration[] => [
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
  {
    id: "dy-text",
    channelId: "douyin",
    eventName: "im_receive_msg",
    name: "接收私信 · 文本",
    kind: "message",
    version: "2026.09",
    source: SOURCE_PRIVATE_MSG,
    contentString: false,
    wire: "json",
    fields: [
      ...dyIdentity,
      field(
        "content.text",
        "消息正文",
        "模拟用户发来的完整文本。换行、表情和特殊字符都会保留。",
        "消息内容",
        "string",
        { multiline: true },
      ),
      field(
        "content.message_type",
        "消息类型",
        "文本为 text。选择其他消息类型时，可新建相应的事件样例。",
        "消息内容",
      ),
      ...dyConversation,
      ...dyEnvelope,
    ],
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyText,
  },
  {
    id: "dy-image",
    channelId: "douyin",
    eventName: "im_receive_msg",
    name: "接收私信 · 图片",
    kind: "message",
    version: "2026.09",
    source: SOURCE_PRIVATE_MSG,
    contentString: false,
    wire: "json",
    fields: [
      ...dyIdentity,
      field(
        "content.message_type",
        "消息类型",
        "此样例为 image。未列出的原始字段可通过完整报文补充。",
        "消息内容",
      ),
      ...dyConversation,
      ...dyEnvelope,
    ],
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyImage,
  },
  {
    id: "dy-enter",
    channelId: "douyin",
    eventName: "im_enter_direct_msg",
    name: "进入私信会话",
    kind: "event",
    version: "2026.09",
    source: SOURCE_ENTER_DIRECT,
    contentString: true,
    wire: "json",
    fields: [
      ...dyIdentity,
      field(
        "content.scene_type",
        "进入来源",
        "3 视频页、4 主页、5 消息页、6 直播页、100 其他。",
        "事件内容",
        "number",
      ),
      ...dyConversation,
      ...dyEnvelope,
    ],
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyEnter,
  },
  {
    id: "dy-read",
    channelId: "douyin",
    eventName: "im_message_read",
    name: "私信已读",
    kind: "event",
    version: "2026.09",
    source: SOURCE_MESSAGE_READ,
    contentString: false,
    wire: "json",
    fields: [
      // 已读事件无 user_infos，身份组由发送者与已读用户构成
      dySenderField,
      field(
        "content.read_open_id",
        "已读用户 ID",
        "实际阅读消息的用户，与消息发送者可能不同。",
        "用户与身份",
      ),
      field(
        "content.index",
        "已读到的序号",
        "与私信的 index 对齐，表示已阅读到哪一条消息。",
        "事件内容",
        "number",
      ),
      ...dyConversation.filter((f) => f.path !== "content.index"),
      ...dyEnvelope,
    ],
    idGenerations: [
      { path: "from_user_id", kind: "openId" },
      { path: "to_user_id", kind: "openId" },
      { path: "log_id", kind: "logId" },
      { path: "content.conversation_short_id", kind: "encryptedId" },
      { path: "content.create_time", kind: "createTimeMs" },
      { path: "content.read_open_id", kind: "openId", sameAs: "to_user_id" },
    ],
    payload: goldenDyRead,
  },
] as const;

// ---- 企业微信（自建应用回调，XML 报文）----
// 载荷与协议事实：docs/research/channels/wecom.md（官方 90239/90240 摄取）。
// 载荷模型：扁平对象，键 = XML 元素名（文档序）；MsgId 64 位整型全程按字符串处理。

const SOURCE_WC_MESSAGE =
  "https://developer.work.weixin.qq.com/document/path/90239";
const SOURCE_WC_EVENT =
  "https://developer.work.weixin.qq.com/document/path/90240";

/** 企微公共字段（§5.2/§5.3 消息与事件共用；序 = 官方文档序） */
const wcCommonFields: FieldDescriptor[] = [
  field(
    "ToUserName",
    "企业 CorpID",
    "接收回调的企业 ID，即连接配置里的 corpId，也是加密 receiveid。",
    "企业与身份",
  ),
  field(
    "FromUserName",
    "成员 UserID",
    "发送消息/触发事件的成员。修改它可模拟不同成员进入会话。",
    "企业与身份",
    "string",
    { required: true },
  ),
  field(
    "CreateTime",
    "消息时间",
    "10 位 Unix 秒级时间戳（与抖音的 13 位毫秒不同）。新建时按当前时间生成。",
    "会话与时序",
    "numberString",
  ),
];

const wcAgentField = field(
  "AgentID",
  "应用 ID",
  "接收回调的自建应用数字 ID。须与连接配置的 agentId 对应。",
  "企业与身份",
  "numberString",
);

/** 事件模板的 MsgType/Event/EventKey（§2.2 事件推送字段集） */
const wcEventFields = (eventKeyNote: string): FieldDescriptor[] => [
  field("MsgType", "消息类型", "事件推送固定为 event。", "事件内容"),
  field(
    "Event",
    "事件类型",
    "官方事件名：enter_agent = 成员进入应用会话；click = 点击菜单按钮。",
    "事件内容",
  ),
  field("EventKey", "事件键值", eventKeyNote, "事件内容"),
];

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
  {
    id: "wc-text",
    channelId: "wecom",
    eventName: "text",
    name: "接收消息 · 文本",
    kind: "message",
    version: "2026.09",
    source: SOURCE_WC_MESSAGE,
    contentString: false,
    wire: "xml",
    xmlLayout: {
      indent: "   ",
      bareTags: ["CreateTime", "MsgId", "AgentID"],
      // §5.2 官方原文 FromUserName 行尾带一个空格——逐字保真
      trailingSpaceTags: ["FromUserName"],
    },
    fields: [
      ...wcCommonFields,
      field(
        "MsgType",
        "消息类型",
        "文本消息固定为 text。其他消息类型（图片/语音等）可按官方文档在完整报文页补充专有字段。",
        "消息内容",
      ),
      field(
        "Content",
        "消息正文",
        "模拟成员发来的完整文本。换行与特殊字符都会按原样进入 CDATA。",
        "消息内容",
        "string",
        { multiline: true, required: true },
      ),
      field(
        "MsgId",
        "消息 ID",
        "64 位整型消息去重 ID。全程按字符串处理不丢精度；新建时按官方形态生成 18 位数字串。",
        "会话与时序",
        "numberString",
      ),
      wcAgentField,
    ],
    idGenerations: [
      { path: "CreateTime", kind: "createTimeSec" },
      { path: "MsgId", kind: "msgId64" },
    ],
    payload: goldenWcText,
  },
  {
    id: "wc-enter",
    channelId: "wecom",
    eventName: "enter_agent",
    name: "进入应用会话",
    kind: "event",
    version: "2026.09",
    source: SOURCE_WC_EVENT,
    contentString: false,
    wire: "xml",
    xmlLayout: wcEventLayout,
    fields: [
      ...wcCommonFields,
      ...wcEventFields(
        "enter_agent 的 EventKey 为空（官方 §2.2：进入会话不携带键值）。",
      ),
      wcAgentField,
    ],
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
  },
  {
    id: "wc-click",
    channelId: "wecom",
    eventName: "click",
    name: "点击菜单按钮",
    kind: "event",
    version: "2026.09",
    source: SOURCE_WC_EVENT,
    contentString: false,
    wire: "xml",
    xmlLayout: wcEventLayout,
    fields: [
      ...wcCommonFields,
      ...wcEventFields(
        "点击菜单按钮时回传的菜单 key 值（官方 §2.2：与菜单配置对应）。",
      ),
      wcAgentField,
    ],
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
  },
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
