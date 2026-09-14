import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  WECOM_DEFINITIONS,
  WECOM_EXPECTED,
  wbCommonEnvelope,
  wbMessageIdGenerations,
} from "./shared";

/**
 * 企微智能机器人 JSON 回调（事实库 §2.10 + §5.7 官方黄金样本，逐字）：
 * 收消息 7 msgtype（text / mixed 图文混排 / image / voice 转文本 / file / video
 * ——后四类仅单聊——+ quote 引用结构）与收事件 4 种（event 通用格式 /
 * enter_chat / template_card_event / template_card_menu_event）。
 * 明文 JSON 载荷由 Rust 适配器加密成 {"encrypt": ...} 信封（receiveid 为空）。
 * 官方 100719/101027 页未入事实库的字段明细（媒体结构体等）以空对象占位，
 * 可在完整报文页增补——不凭空编造官方字段。
 */

/** 官方黄金样本 §5.7：引用消息完整回调（逐字） */
const goldenWbQuote: WirePayload = {
  ...wbCommonEnvelope("group"),
  response_url: "RESPONSEURL",
  msgtype: "text",
  text: {
    content: "@RobotA hello robot",
  },
  quote: {
    msgtype: "text",
    text: {
      content: "这是今日的测试情况",
    },
  },
};

export const WECOM_AIBOT_SCHEMAS = [
  defineSchema(WECOM_DEFINITIONS, "wb-text", {
    eventName: "text",
    name: "机器人收消息 · 文本",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: WECOM_EXPECTED,
    idGenerations: wbMessageIdGenerations(),
    payload: {
      ...wbCommonEnvelope("group"),
      response_url: "RESPONSEURL",
      msgtype: "text",
      text: {
        content: "@RobotA hello robot",
      },
    },
  }),
  defineSchema(WECOM_DEFINITIONS, "wb-quote", {
    eventName: "quote",
    name: "机器人收消息 · 引用",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: WECOM_EXPECTED,
    idGenerations: wbMessageIdGenerations(),
    payload: goldenWbQuote,
  }),
  defineSchema(WECOM_DEFINITIONS, "wb-mixed", {
    eventName: "mixed",
    name: "机器人收消息 · 图文混排",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: WECOM_EXPECTED,
    idGenerations: wbMessageIdGenerations(),
    payload: {
      ...wbCommonEnvelope("group"),
      response_url: "RESPONSEURL",
      msgtype: "mixed",
      mixed: {},
    },
  }),
  defineSchema(WECOM_DEFINITIONS, "wb-image", {
    eventName: "image",
    name: "机器人收消息 · 图片",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: WECOM_EXPECTED,
    idGenerations: wbMessageIdGenerations(),
    payload: {
      ...wbCommonEnvelope("single"),
      response_url: "RESPONSEURL",
      msgtype: "image",
      image: {},
    },
  }),
  defineSchema(WECOM_DEFINITIONS, "wb-voice", {
    eventName: "voice",
    name: "机器人收消息 · 语音",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: WECOM_EXPECTED,
    idGenerations: wbMessageIdGenerations(),
    payload: {
      ...wbCommonEnvelope("single"),
      response_url: "RESPONSEURL",
      msgtype: "voice",
      voice: {},
    },
  }),
  defineSchema(WECOM_DEFINITIONS, "wb-file", {
    eventName: "file",
    name: "机器人收消息 · 文件",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: WECOM_EXPECTED,
    idGenerations: wbMessageIdGenerations(),
    payload: {
      ...wbCommonEnvelope("single"),
      response_url: "RESPONSEURL",
      msgtype: "file",
      file: {},
    },
  }),
  defineSchema(WECOM_DEFINITIONS, "wb-video", {
    eventName: "video",
    name: "机器人收消息 · 视频",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: WECOM_EXPECTED,
    idGenerations: wbMessageIdGenerations(),
    payload: {
      ...wbCommonEnvelope("single"),
      response_url: "RESPONSEURL",
      msgtype: "video",
      video: {},
    },
  }),
  defineSchema(WECOM_DEFINITIONS, "wb-event", {
    eventName: "event",
    name: "机器人收事件 · 通用格式",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WECOM_EXPECTED,
    idGenerations: wbMessageIdGenerations(),
    payload: {
      ...wbCommonEnvelope("group"),
      msgtype: "event",
      event: {
        eventtype: "",
      },
    },
  }),
  defineSchema(WECOM_DEFINITIONS, "wb-event-enter-chat", {
    eventName: "event",
    name: "机器人收事件 · 进入会话",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WECOM_EXPECTED,
    idGenerations: wbMessageIdGenerations(),
    payload: {
      ...wbCommonEnvelope("group"),
      msgtype: "event",
      event: {
        eventtype: "enter_chat",
      },
    },
  }),
  defineSchema(WECOM_DEFINITIONS, "wb-event-template-card", {
    eventName: "event",
    name: "机器人收事件 · 模板卡片",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WECOM_EXPECTED,
    idGenerations: wbMessageIdGenerations(),
    payload: {
      ...wbCommonEnvelope("group"),
      msgtype: "event",
      event: {
        eventtype: "template_card_event",
      },
    },
  }),
  defineSchema(WECOM_DEFINITIONS, "wb-event-template-card-menu", {
    eventName: "event",
    name: "机器人收事件 · 卡片菜单",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WECOM_EXPECTED,
    idGenerations: wbMessageIdGenerations(),
    payload: {
      ...wbCommonEnvelope("group"),
      msgtype: "event",
      event: {
        eventtype: "template_card_menu_event",
      },
    },
  }),
] as const;
