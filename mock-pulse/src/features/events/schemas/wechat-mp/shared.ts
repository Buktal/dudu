import {
  mergeChannelDefinitions,
  parseChannelDefinition,
} from "../../definitions/loader";
import mpEventDefinitions from "../../definitions/wechat-mp/mp-events.json";
import mpMenuDefinitions from "../../definitions/wechat-mp/mp-menu.json";
import mpMessageDefinitions from "../../definitions/wechat-mp/mp-messages.json";
import mpMessageMediaDefinitions from "../../definitions/wechat-mp/mp-messages-media.json";
import mpReceiptDefinitions from "../../definitions/wechat-mp/mp-receipts.json";
import type {
  ExpectedReceipt,
  IdGeneration,
  WirePayload,
  XmlLayout,
} from "../types";

/**
 * 公众号渠道协议元数据公共体（事实库 docs/research/channels/wechat-mp.md）：
 * 推送仅 XML（事实库 §2），载荷逐字取自官方核验样本；嵌套结构
 * （ScanCodeInfo/SendPicsInfo/SendLocationInfo/订阅通知 List）按「未知元素
 * 原文片段」透传（不带字段说明，完整报文页可改）。AES 加密信封（尾部 AppId
 * 校验、三模式）由 Rust 适配器完成，模板只持有明文。
 * 字段说明与版本/来源由 definitions/wechat-mp/ 分域描述文件装载即校验后合并。
 */

/** 版本化字段描述文件：按推送域分五份，装载即校验（坏文件启动即炸）后合并 */
export const MP_DEFINITIONS = mergeChannelDefinitions(
  [
    mpMessageDefinitions,
    mpMessageMediaDefinitions,
    mpEventDefinitions,
    mpMenuDefinitions,
    mpReceiptDefinitions,
  ].map((part) => parseChannelDefinition(part)),
);

/**
 * 公众号官方成功语义（事实库 §3.3）：5 秒内回包即成功，推荐回 success
 * （不带引号），回空串亦可——期望默认取官方推荐的逐字 success；
 * 目标服务改回空串或加密被动回复包时可在编辑器切换期望（微信系回执形态）。
 */
export const MP_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "success",
  bodyMode: "wecomReply",
};

/**
 * 成员消息类排版：§5.1/§5.2/§5.3 官方消息样本（单空格缩进）；数值字段
 * （CreateTime/MsgId/MsgDataId/Idx 与 location 坐标）为裸文本。
 * 备注：§5.2 图片样本 MsgDataId 行官方多一个空格，属文档排版噪音，
 * 构建器的统一缩进规则无法逐行表达，按 §5.1 单空格归一（值仍逐字）。
 */
export const mpMessageLayout: XmlLayout = {
  indent: " ",
  bareTags: [
    "CreateTime",
    "MsgId",
    "MsgDataId",
    "Idx",
    "Location_X",
    "Location_Y",
    "Scale",
  ],
};

/** 基础事件排版：§5.5/§5.6 官方事件样本（两空格缩进，LOCATION 数值裸文本） */
export const mpEventLayout: XmlLayout = {
  indent: "  ",
  bareTags: ["CreateTime", "Latitude", "Longitude", "Precision"],
};

/**
 * 菜单事件排版：§5.8/§5.9 官方样本为紧凑风格（零缩进，Count 数值裸文本）；
 * 官方 <xml> 与首元素同行，构建器统一 <xml> 独占首行（结构性差异，值逐字）。
 */
export const mpMenuLayout: XmlLayout = {
  indent: "",
  bareTags: ["CreateTime"],
};

/** 结果回执排版：§5.11 官方样本（两空格缩进，MsgID 裸文本、Status CDATA） */
export const mpReceiptLayout: XmlLayout = {
  indent: "  ",
  bareTags: ["CreateTime", "MsgID"],
};

/**
 * XML 成员消息信封（§2.1 公共字段逐字；CreateTime/MsgId 取官方样本值）：
 * 专有字段按各消息类型追加在 MsgType 后，公共尾 MsgId/MsgDataId/Idx 殿后
 * （官方样本文档序）。
 */
export function mpMessageEnvelope(
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
    MsgDataId: "xxxx",
    Idx: "xxxx",
  };
}

/** XML 成员消息的 ID 生成规则：CreateTime + MsgId（64 位整型数字串） */
export function mpMessageIdGenerations(): IdGeneration[] {
  return [
    { path: "CreateTime", kind: "createTimeSec" },
    { path: "MsgId", kind: "msgId64" },
  ];
}

/** XML 事件信封（§5.5 官方骨架）：专有字段按各事件追加在 Event 后 */
export function mpEventEnvelope(
  event: string,
  extra: Record<string, string> = {},
): WirePayload {
  return {
    ToUserName: "toUser",
    FromUserName: "FromUser",
    CreateTime: "123456789",
    MsgType: "event",
    Event: event,
    ...extra,
  };
}

/** 事件信封的 ID 生成规则：仅 CreateTime（事件排重官方推荐 FromUserName+CreateTime） */
export function mpEventIdGenerations(): IdGeneration[] {
  return [{ path: "CreateTime", kind: "createTimeSec" }];
}

/**
 * 菜单事件信封（§5.8/§5.9 官方样本值逐字）：专有字段追加在 EventKey 后；
 * 菜单页 VIEW/view_miniprogram 的 EventKey/MenuId 由调用方覆写。
 */
export function mpMenuEnvelope(
  event: string,
  createTime: string,
  extra: Record<string, string> = {},
): WirePayload {
  return {
    ToUserName: "gh_e136c6e50636",
    FromUserName: "oMgHVjngRipVsoxg6TuX3vz6glDg",
    CreateTime: createTime,
    MsgType: "event",
    Event: event,
    EventKey: "6",
    ...extra,
  };
}

/**
 * 结果回执信封（§5.11 官方样本骨架；订阅通知三事件的 ToUserName/FromUserName
 * 按各自官方样本值覆写）。
 */
export function mpReceiptEnvelope(
  event: string,
  extra: Record<string, string> = {},
): WirePayload {
  return {
    ToUserName: "gh_7f083739789a",
    FromUserName: "oia2TjuEGTNoeX76QEjQNrcURxG8",
    CreateTime: "1395658920",
    MsgType: "event",
    Event: event,
    ...extra,
  };
}
