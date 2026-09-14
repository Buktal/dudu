import { parseChannelDefinition } from "../definitions/loader";
import wecomDefinition from "../definitions/wecom.json";
import { defineSchema } from "./define";
import type { ExpectedReceipt, WirePayload, XmlLayout } from "./types";

/**
 * 企业微信渠道协议元数据（自建应用回调，XML 报文）。
 * 载荷与协议事实：docs/research/channels/wecom.md（官方 90239/90240 摄取）；
 * 字段说明与版本/来源由 ../definitions/wecom.json 经 loader 装载即校验。
 * 载荷模型：扁平对象，键 = XML 元素名（文档序）；MsgId 64 位整型全程按字符串处理。
 */

/** 版本化字段描述文件：随应用分发，装载即校验（坏文件启动即炸） */
export const WECOM_DEFINITIONS = parseChannelDefinition(wecomDefinition);

/**
 * 企微官方成功语义：5 秒内回包即成功，正文形态走企微回执三态
 * （默认期望留空 = 服务原样回空串；要验证加密回包可在编辑器改期望）。
 */
const WECOM_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "",
  bodyMode: "wecomReply",
};

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

export const WECOM_EVENT_SCHEMAS = [
  defineSchema(WECOM_DEFINITIONS, "wc-text", {
    eventName: "text",
    name: "接收消息 · 文本",
    kind: "message",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
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
  defineSchema(WECOM_DEFINITIONS, "wc-enter", {
    eventName: "enter_agent",
    name: "进入应用会话",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
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
  defineSchema(WECOM_DEFINITIONS, "wc-click", {
    eventName: "click",
    name: "点击菜单按钮",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
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
