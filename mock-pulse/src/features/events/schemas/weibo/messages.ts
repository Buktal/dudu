import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  WB_DEFINITIONS,
  WB_EXPECTED,
  wbEnvelope,
  wbIdGenerations,
} from "./shared";

/**
 * 微博私信四种（事实库 §2.1/§5.1–§5.4，type 直接判型）：
 * text 纯文本 / position 位置（注意不是 location）/ voice 语音 / image 图片。
 * 载荷逐字取自「接收普通消息」页官方样本：text 的 data 恒为空对象，
 * position 的经纬度为字符串形态，voice/image 的 vfid/tovfid 为 int64 数字
 * （官方行内注释：发送者用 vfid、接收者用 tovfid）。
 */

/** 官方样本 §5.1：纯文本私信（data 恒空对象） */
const GOLDEN_TEXT: WirePayload = wbEnvelope("text", "私信或留言内容", {});

/** 官方样本 §5.2：位置私信（经纬度为字符串形态，text 为原文案） */
const GOLDEN_POSITION: WirePayload = wbEnvelope(
  "position",
  "我在这里: http://t.cn/zQgLLYO",
  { longitude: "116.308586", latitude: "39.982525" },
);

/** 官方样本 §5.3：语音私信（vfid 发送者用 / tovfid 接收者用，int64 数字） */
const GOLDEN_VOICE: WirePayload = wbEnvelope("voice", "发了一个语音消息", {
  vfid: 821804459,
  tovfid: 821804469,
});

/** 官方样本 §5.4：图片私信（vfid/tovfid 同语音私信） */
const GOLDEN_IMAGE: WirePayload = wbEnvelope("image", "发了一张图片", {
  vfid: 821804459,
  tovfid: 821804469,
});

export const WB_MESSAGE_SCHEMAS = [
  defineSchema(WB_DEFINITIONS, "weibo-text", {
    eventName: "text",
    name: "纯文本私信",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: WB_EXPECTED,
    idGenerations: wbIdGenerations(),
    payload: GOLDEN_TEXT,
  }),
  defineSchema(WB_DEFINITIONS, "weibo-position", {
    eventName: "position",
    name: "位置私信",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: WB_EXPECTED,
    idGenerations: wbIdGenerations(),
    payload: GOLDEN_POSITION,
  }),
  defineSchema(WB_DEFINITIONS, "weibo-voice", {
    eventName: "voice",
    name: "语音私信",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: WB_EXPECTED,
    idGenerations: wbIdGenerations(),
    payload: GOLDEN_VOICE,
  }),
  defineSchema(WB_DEFINITIONS, "weibo-image", {
    eventName: "image",
    name: "图片私信",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: WB_EXPECTED,
    idGenerations: wbIdGenerations(),
    payload: GOLDEN_IMAGE,
  }),
] as const;
