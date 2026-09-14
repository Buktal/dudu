import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  MP_DEFINITIONS,
  MP_EXPECTED,
  mpMessageEnvelope,
  mpMessageIdGenerations,
  mpMessageLayout,
} from "./shared";

/**
 * 公众号接收普通消息（事实库 §2.1 七种 MsgType + §5.1–§5.4 官方样本，逐字）：
 * text / image / voice / video / shortvideo / location / link。
 * 专有字段按 §2.1 字段表追加（voice 的 MediaId16K 为公众号独有，
 * location 官方定义 X=纬度/Y=经度）；text/image/voice 逐字复刻官方黄金样本，
 * video/shortvideo/location/link 官方无整包样本，按字段表 + §5.4 数值构造。
 */

/** 官方黄金样本 §5.1：文本消息（逐字） */
const goldenMpText: WirePayload = {
  ToUserName: "toUser",
  FromUserName: "fromUser",
  CreateTime: "1348831860",
  MsgType: "text",
  Content: "this is a test",
  MsgId: "1234567890123456",
  MsgDataId: "xxxx",
  Idx: "xxxx",
};

/** 官方黄金样本 §5.3：语音消息（逐字；MediaId16K 为公众号独有） */
const goldenMpVoice: WirePayload = {
  ToUserName: "toUser",
  FromUserName: "fromUser",
  CreateTime: "1357290913",
  MsgType: "voice",
  MediaId: "media_id",
  Format: "Format",
  MsgId: "1234567890123456",
  MsgDataId: "xxxx",
  Idx: "xxxx",
  MediaId16K: "media_id_16k",
};

export const MP_MESSAGE_SCHEMAS = [
  defineSchema(MP_DEFINITIONS, "wm-text", {
    eventName: "text",
    name: "接收消息 · 文本",
    kind: "message",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpMessageLayout,
    idGenerations: mpMessageIdGenerations(),
    payload: goldenMpText,
  }),
  defineSchema(MP_DEFINITIONS, "wm-image", {
    eventName: "image",
    name: "接收消息 · 图片",
    kind: "message",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpMessageLayout,
    idGenerations: mpMessageIdGenerations(),
    // 官方黄金样本 §5.2（逐字；MsgDataId 行官方多一个空格，排版按 §5.1 归一）
    payload: mpMessageEnvelope("image", {
      PicUrl: "this is a url",
      MediaId: "media_id",
    }),
  }),
  defineSchema(MP_DEFINITIONS, "wm-voice", {
    eventName: "voice",
    name: "接收消息 · 语音",
    kind: "message",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpMessageLayout,
    idGenerations: mpMessageIdGenerations(),
    payload: goldenMpVoice,
  }),
  defineSchema(MP_DEFINITIONS, "wm-video", {
    eventName: "video",
    name: "接收消息 · 视频",
    kind: "message",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpMessageLayout,
    idGenerations: mpMessageIdGenerations(),
    payload: mpMessageEnvelope("video", {
      MediaId: "media_id",
      ThumbMediaId: "thumb_media_id",
    }),
  }),
  defineSchema(MP_DEFINITIONS, "wm-shortvideo", {
    eventName: "shortvideo",
    name: "接收消息 · 小视频",
    kind: "message",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpMessageLayout,
    idGenerations: mpMessageIdGenerations(),
    // 小视频与 video 同构，仅 MsgType 不同（事实库 §2.1）
    payload: mpMessageEnvelope("shortvideo", {
      MediaId: "media_id",
      ThumbMediaId: "thumb_media_id",
    }),
  }),
  defineSchema(MP_DEFINITIONS, "wm-location", {
    eventName: "location",
    name: "接收消息 · 位置",
    kind: "message",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpMessageLayout,
    idGenerations: mpMessageIdGenerations(),
    // 坐标取 §5.4 官方数值例（X=纬度/Y=经度，官方如此定义）
    payload: mpMessageEnvelope("location", {
      Location_X: "23.134521",
      Location_Y: "113.358803",
      Scale: "20",
      Label: "广州市海珠区客村艺苑路 106号",
    }),
  }),
  defineSchema(MP_DEFINITIONS, "wm-link", {
    eventName: "link",
    name: "接收消息 · 链接",
    kind: "message",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpMessageLayout,
    idGenerations: mpMessageIdGenerations(),
    payload: mpMessageEnvelope("link", {
      Title: "TITLE",
      Description: "DESCRIPTION",
      Url: "https://developers.weixin.qq.com",
    }),
  }),
] as const;
