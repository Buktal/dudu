import {
  mergeChannelDefinitions,
  parseChannelDefinition,
} from "../../definitions/loader";
import agentEventCardDefinitions from "../../definitions/wecom/agent-events-card.json";
import agentEventCoreDefinitions from "../../definitions/wecom/agent-events-core.json";
import agentEventInteractionDefinitions from "../../definitions/wecom/agent-events-interaction.json";
import agentEventLifecycleDefinitions from "../../definitions/wecom/agent-events-lifecycle.json";
import agentEventMenuDefinitions from "../../definitions/wecom/agent-events-menu.json";
import agentMessageDefinitions from "../../definitions/wecom/agent-messages.json";
import aibotEventDefinitions from "../../definitions/wecom/aibot-events.json";
import aibotMessageDefinitions from "../../definitions/wecom/aibot-messages.json";
import type {
  ExpectedReceipt,
  IdGeneration,
  WirePayload,
  XmlLayout,
} from "../types";

/**
 * 企微渠道协议元数据公共体（XML 自建应用 + 智能机器人 JSON 两条通道共用，
 * 事实库 docs/research/channels/wecom.md）：
 * - 自建应用（90239/90240/90970）：明文 XML 报文，成员消息 6 MsgType + 事件字典 26 Event
 * - 智能机器人（100719/101027）：明文 JSON 报文，收消息 7 msgtype + 收事件 4 种
 * 加密信封（AES、receiveid 语义差异）在 Rust 适配器内完成，模板只持有明文。
 * 字段说明与版本/来源由 definitions/wecom/ 八份分通道描述文件装载即校验后合并。
 */

/** 版本化字段描述文件：按通道分八份，装载即校验（坏文件启动即炸）后合并 */
export const WECOM_DEFINITIONS = mergeChannelDefinitions(
  [
    agentMessageDefinitions,
    agentEventCoreDefinitions,
    agentEventMenuDefinitions,
    agentEventInteractionDefinitions,
    agentEventCardDefinitions,
    agentEventLifecycleDefinitions,
    aibotMessageDefinitions,
    aibotEventDefinitions,
  ].map((part) => parseChannelDefinition(part)),
);

/**
 * 企微官方成功语义：5 秒内回包即成功，正文形态走企微回执三态
 * （默认期望留空 = 服务原样回空串；要验证加密回包可在编辑器改期望）。
 * XML 与机器人 JSON 两条通道同语义（机器人模板卡片事件 5 秒无响应直接丢弃）。
 */
export const WECOM_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "",
  bodyMode: "wecomReply",
};

/** 事件类排版：§5.3/§5.4 官方事件样本（tab 缩进、无行尾空格） */
export const wcEventLayout: XmlLayout = {
  indent: "\t",
  bareTags: ["CreateTime", "MsgId", "AgentID"],
};

/** 成员消息类排版：§5.2 官方消息样本（三空格缩进 + FromUserName 行尾空格） */
export const wcMessageLayout: XmlLayout = {
  indent: "   ",
  bareTags: ["CreateTime", "MsgId", "AgentID"],
  // §5.2 官方原文 FromUserName 行尾带一个空格——逐字保真
  trailingSpaceTags: ["FromUserName"],
};

/** XML 成员消息信封（§5.2 公共字段逐字）：专有字段按各消息类型追加在 MsgType 后 */
export function wcMessageEnvelope(
  msgType: string,
  extra: Record<string, string> = {},
): WirePayload {
  return {
    ToUserName: "toUser",
    FromUserName: "fromUser",
    CreateTime: "1348831860",
    MsgType: msgType,
    ...extra,
    MsgId: "1234567890123456",
    AgentID: "1",
  };
}

/** XML 事件信封（§5.3 官方骨架）：专有字段按各事件追加在 Event 后 */
export function wcEventEnvelope(
  event: string,
  extra: Record<string, string> = {},
): WirePayload {
  return {
    ToUserName: "toUser",
    FromUserName: "UserID",
    CreateTime: "1348831860",
    MsgType: "event",
    Event: event,
    ...extra,
    AgentID: "1",
  };
}

/** 事件信封的 ID 生成规则：仅 CreateTime（官方事件推送不携带 MsgId） */
export function wcEventIdGenerations(): IdGeneration[] {
  return [{ path: "CreateTime", kind: "createTimeSec" }];
}

/** XML 成员消息的 ID 生成规则：CreateTime + MsgId（64 位整型数字串） */
export function wcMessageIdGenerations(): IdGeneration[] {
  return [
    { path: "CreateTime", kind: "createTimeSec" },
    { path: "MsgId", kind: "msgId64" },
  ];
}

/** 机器人 JSON 回调公共字段（官方 §5.7 黄金样本值逐字） */
export function wbCommonEnvelope(
  chattype: "single" | "group",
  extra: WirePayload = {},
): WirePayload {
  return {
    msgid: "CAIQ16HMjQYY/NGagIOAgAMgq4KM0AI=",
    aibotid: "AIBOTID",
    chatid: "CHATID",
    chattype,
    from: {
      userid: "USERID",
    },
    ...extra,
  };
}

/** 机器人收消息的 ID 生成规则：仅 msgid（官方无时间戳字段，排重靠 msgid） */
export function wbMessageIdGenerations(): IdGeneration[] {
  return [{ path: "msgid", kind: "aibotMsgId" }];
}
