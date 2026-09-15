import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  TB_DEFINITIONS,
  TB_EXPECTED,
  tbOpenimEnvelope,
  tbOpenimIdGenerations,
} from "./shared";

/**
 * OpenIM 离线消息推送（事实库 §2.4：消息类目 cid=233 全类目仅
 * taobao_openim_OffMsgPush 一个 topic，From淘宝，免授权消息推送）。
 * 载荷全文待核验(09-27)（topicDetail apiId=786 未取得官方原文）——本模板取
 * 事实库 §5.8 旺旺聊天文本 envelope 官方样本逐字（仅形态参考，键序同原文），
 * 字段说明随条目标注口径出处。
 */

/** 官方样本 §5.8：旺旺聊天文本 envelope 逐字（形态参考） */
const GOLDEN_OFFMSG_PUSH: WirePayload = tbOpenimEnvelope("文本啊啊啊");

export const TB_OPENIM_SCHEMAS = [
  defineSchema(TB_DEFINITIONS, "tb-openim-offmsg-push", {
    eventName: "taobao_openim_OffMsgPush",
    name: "OpenIM 离线消息推送（形态参考）",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: TB_EXPECTED,
    idGenerations: tbOpenimIdGenerations(),
    payload: GOLDEN_OFFMSG_PUSH,
  }),
] as const;
