import { defineSchema } from "../define";
import type { WirePayload, XmlLayout } from "../types";
import {
  WECOM_DEFINITIONS,
  WECOM_EXPECTED,
  wcEventIdGenerations,
} from "./shared";

/**
 * 企微事件字典 · 微信客服（事实库 §2.6，94670）：
 * Event=kf_msg_or_event，两段式——回调只做通知，真实消息经
 * sync_msg 拉取（最近 3 天）。官方 §5.6 黄金样本逐字：无 FromUserName、
 * 无 AgentID，三空格缩进；Token 为拉取用临时凭证（10 分钟内有效）。
 */

/** 官方黄金样本 §5.6：微信客服回调（逐字；注意无 FromUserName/AgentID） */
const goldenWcKfMsgOrEvent: WirePayload = {
  ToUserName: "ww12345678910",
  CreateTime: "1348831860",
  MsgType: "event",
  Event: "kf_msg_or_event",
  Token: "ENCApHxnGDNAVNY4AaSJKj4Tb5mwsEMzxhFmHVGcra996NR",
  OpenKfId: "wkxxxxxxx",
};

/** 微信客服回调排版：§5.6 官方样本（三空格缩进，仅 CreateTime 裸文本） */
const wcKfLayout: XmlLayout = {
  indent: "   ",
  bareTags: ["CreateTime"],
};

export const WECOM_KF_EVENT_SCHEMAS = [
  defineSchema(WECOM_DEFINITIONS, "wc-kf-msg-or-event", {
    eventName: "kf_msg_or_event",
    name: "微信客服 · 消息与事件通知",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcKfLayout,
    idGenerations: wcEventIdGenerations(),
    payload: goldenWcKfMsgOrEvent,
  }),
] as const;
