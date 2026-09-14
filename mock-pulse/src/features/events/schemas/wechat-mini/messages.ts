import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  MINI_DEFINITIONS,
  MINI_EXPECTED,
  miniMessageEnvelope,
  miniMessageIdGenerations,
  miniMessageLayout,
} from "./shared";

/**
 * 小程序客服接收消息（事实库 §2.1 三种 MsgType + §5.3/§5.4 官方样本，逐字）：
 * text / image / miniprogrampage——官方 receive.html 全页仅此三包（无
 * voice/video/位置等接收包，与公众号七种普通消息不同）。text 为 XML 黄金
 * 样本逐字；image/miniprogrampage 官方仅给 JSON 样本（XML 同构），按样本
 * 文档序落值（miniprogrampage 的 MsgId 官方序在 MsgType 之后）。
 */

/** 官方黄金样本 §5.3：客服文本消息（XML 逐字） */
const goldenMiniText: WirePayload = {
  ToUserName: "toUser",
  FromUserName: "fromUser",
  CreateTime: "1482048670",
  MsgType: "text",
  Content: "this is a test",
  MsgId: "1234567890123456",
};

export const MINI_MESSAGE_SCHEMAS = [
  defineSchema(MINI_DEFINITIONS, "wmn-text", {
    eventName: "text",
    name: "客服消息 · 文本",
    kind: "message",
    contentString: false,
    wire: "xml",
    expected: MINI_EXPECTED,
    xmlLayout: miniMessageLayout,
    idGenerations: miniMessageIdGenerations(),
    payload: goldenMiniText,
  }),
  defineSchema(MINI_DEFINITIONS, "wmn-image", {
    eventName: "image",
    name: "客服消息 · 图片",
    kind: "message",
    contentString: false,
    wire: "xml",
    expected: MINI_EXPECTED,
    xmlLayout: miniMessageLayout,
    idGenerations: miniMessageIdGenerations(),
    // 官方样本 §5.4（JSON 逐字，XML 同构）
    payload: miniMessageEnvelope("image", {
      PicUrl: "this is a url",
      MediaId: "media_id",
      MsgId: "1234567890123456",
    }),
  }),
  defineSchema(MINI_DEFINITIONS, "wmn-miniprogrampage", {
    eventName: "miniprogrampage",
    name: "客服消息 · 小程序卡片",
    kind: "message",
    contentString: false,
    wire: "xml",
    expected: MINI_EXPECTED,
    xmlLayout: miniMessageLayout,
    idGenerations: miniMessageIdGenerations(),
    // 官方样本 §5.4（JSON 逐字，XML 同构；MsgId 官方序在 MsgType 之后，
    // ThumbUrl/ThumbMediaId 官方为空串原样保留）
    payload: miniMessageEnvelope("miniprogrampage", {
      MsgId: "1234567890123456",
      Title: "title",
      AppId: "appid",
      PagePath: "path",
      ThumbUrl: "",
      ThumbMediaId: "",
    }),
  }),
] as const;
