import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  WECOM_DEFINITIONS,
  WECOM_EXPECTED,
  wcMessageEnvelope,
  wcMessageIdGenerations,
  wcMessageLayout,
} from "./shared";

/**
 * 企微自建应用成员消息（事实库 §2.1 六 MsgType，逐字）：
 * text（官方黄金样本 §5.2）/ image / voice / video / location / link。
 * 公共字段 ToUserName/FromUserName/CreateTime/MsgId/AgentID，
 * 专有字段按官方字段表追加；媒体 ID 官方约束仅三天内有效。
 * 文本模板逐字复刻官方黄金样本；其余消息类型的字段集按 §2.1 字段表构造。
 */

/** 官方黄金样本 §5.2：文本消息（逐字） */
const goldenWcText: WirePayload = {
  ToUserName: "toUser",
  FromUserName: "fromUser",
  CreateTime: "1348831860",
  MsgType: "text",
  Content: "this is a test",
  MsgId: "1234567890123456",
  AgentID: "1",
};

export const WECOM_AGENT_MESSAGE_SCHEMAS = [
  defineSchema(WECOM_DEFINITIONS, "wc-text", {
    eventName: "text",
    name: "接收消息 · 文本",
    kind: "message",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcMessageLayout,
    idGenerations: wcMessageIdGenerations(),
    payload: goldenWcText,
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-image", {
    eventName: "image",
    name: "接收消息 · 图片",
    kind: "message",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcMessageLayout,
    idGenerations: wcMessageIdGenerations(),
    payload: wcMessageEnvelope("image", {
      PicUrl: "PICURL",
      MediaId: "MEDIAID",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-voice", {
    eventName: "voice",
    name: "接收消息 · 语音",
    kind: "message",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcMessageLayout,
    idGenerations: wcMessageIdGenerations(),
    payload: wcMessageEnvelope("voice", {
      MediaId: "MEDIAID",
      Format: "amr",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-video", {
    eventName: "video",
    name: "接收消息 · 视频",
    kind: "message",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcMessageLayout,
    idGenerations: wcMessageIdGenerations(),
    payload: wcMessageEnvelope("video", {
      MediaId: "MEDIAID",
      ThumbMediaId: "THUMBMEDIAID",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-location", {
    eventName: "location",
    name: "接收消息 · 位置",
    kind: "message",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcMessageLayout,
    idGenerations: wcMessageIdGenerations(),
    payload: wcMessageEnvelope("location", {
      Location_X: "23.137466",
      Location_Y: "113.352425",
      Scale: "15",
      Label: "广州市海珠区客村地铁站A出口",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-link", {
    eventName: "link",
    name: "接收消息 · 链接",
    kind: "message",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcMessageLayout,
    idGenerations: wcMessageIdGenerations(),
    payload: wcMessageEnvelope("link", {
      Title: "TITLE",
      Description: "DESCRIPTION",
      Url: "https://work.weixin.qq.com",
      PicUrl: "PICURL",
    }),
  }),
] as const;
