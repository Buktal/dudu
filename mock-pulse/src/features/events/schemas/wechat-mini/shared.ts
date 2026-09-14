import {
  mergeChannelDefinitions,
  parseChannelDefinition,
} from "../../definitions/loader";
import miniAuthorizationDefinitions from "../../definitions/wechat-mini/mini-authorization.json";
import miniEventDefinitions from "../../definitions/wechat-mini/mini-events.json";
import miniMessageDefinitions from "../../definitions/wechat-mini/mini-messages.json";
import type {
  ExpectedReceipt,
  IdGeneration,
  WirePayload,
  XmlLayout,
} from "../types";

/**
 * 小程序渠道协议元数据公共体（事实库 docs/research/channels/wechat-mini.md）：
 * 数据格式官方 XML/JSON 双选，按事实库结论取 XML 为主——载荷逐字取自官方
 * 核验样本的 XML 形态（仅 JSON 样本的包按「XML 同构」落值）。加密回包信封
 * （AES/尾部 AppId 校验、三模式、Nonce 复用请求值）由 Rust 适配器完成，
 * 模板只持有明文。字段说明与版本/来源由 definitions/wechat-mini/
 * 分域描述文件装载即校验后合并。
 */

/** 版本化字段描述文件：按推送域分三份，装载即校验（坏文件启动即炸）后合并 */
export const MINI_DEFINITIONS = mergeChannelDefinitions(
  [
    miniMessageDefinitions,
    miniEventDefinitions,
    miniAuthorizationDefinitions,
  ].map((part) => parseChannelDefinition(part)),
);

/**
 * 小程序官方成功语义（事实库 §3.4）：「回复空串或者 success 即可」；
 * event_push 授权变更页同样要求回 success 或空字符串（无需加密）。
 * 期望默认取官方推荐的逐字 success；目标服务改回空串或加密回包信封时
 * 可在编辑器切换期望（微信系回执形态）。
 */
export const MINI_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "success",
  bodyMode: "wecomReply",
};

/**
 * 客服消息排版：§5.3 官方客服文本消息样本（三空格缩进）；数值字段
 * （CreateTime/MsgId）为裸文本。图片/小程序卡片/进入会话事件官方仅给
 * JSON 样本（§5.4「XML 同构」），排版随本族样本归一（值仍逐字）。
 */
export const miniMessageLayout: XmlLayout = {
  indent: "   ",
  bareTags: ["CreateTime", "MsgId"],
};

/** 授权变更事件排版：§5.7 官方 user_authorization_revoke XML 样本（两空格缩进） */
export const miniEventLayout: XmlLayout = {
  indent: "  ",
  bareTags: ["CreateTime"],
};

/**
 * XML 客服消息信封（§5.3/§5.4 公共字段逐字；CreateTime 取官方样本值）：
 * 专有字段由调用方按官方样本文档序追加（miniprogrampage 的 MsgId 在
 * MsgType 之后，text/image 的 MsgId 殿后，均由调用方落位）。
 */
export function miniMessageEnvelope(
  msgType: string,
  extra: Record<string, string> = {},
): WirePayload {
  return {
    ToUserName: "toUser",
    FromUserName: "fromUser",
    CreateTime: "1482048670",
    MsgType: msgType,
    ...extra,
  };
}

/** XML 客服消息的 ID 生成规则：CreateTime + MsgId（64 位整型数字串） */
export function miniMessageIdGenerations(): IdGeneration[] {
  return [
    { path: "CreateTime", kind: "createTimeSec" },
    { path: "MsgId", kind: "msgId64" },
  ];
}

/**
 * XML 事件信封（公共字段口径同 §5.3/§5.7）：专有字段按各事件追加在 Event 后。
 * 客服事件身份取 §5.4 样本占位（toUser/fromUser）；授权变更事件身份由
 * 授权模块按 §5.7 官方样本覆写。
 */
export function miniEventEnvelope(
  event: string,
  extra: Record<string, string> = {},
): WirePayload {
  return {
    ToUserName: "toUser",
    FromUserName: "fromUser",
    CreateTime: "1482048670",
    MsgType: "event",
    Event: event,
    ...extra,
  };
}

/** 事件信封的 ID 生成规则：仅 CreateTime（事件无 MsgId，事实库 §2.2） */
export function miniEventIdGenerations(): IdGeneration[] {
  return [{ path: "CreateTime", kind: "createTimeSec" }];
}
