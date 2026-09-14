import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import { DOUYIN_DEFINITIONS, MINI_GAME_EXPECTED } from "./shared";

/**
 * 抖音小游戏消息推送体系（事实库 §3.4/§5.19，逐字）：
 * 与 dop 完全不同的信封（{ToUserName, FromUserName, CreateTime, MsgType, ...}）
 * 与验签（x-signature = base64(md5(排序四头 + body + token))，头在 Rust 适配器生成）。
 * 旧「消息推送客服」GET echostr 体系 2025-06-30 已下线，不复刻。
 */

/** 官方黄金样本 §5.19：小游戏客服消息（JSON 格式，逐字；douyin_microgame_im） */
const goldenDyMgImText: WirePayload = {
  ToUserName: "appid",
  FromUserName: "openid",
  CreateTime: 1577364225,
  MsgType: "text",
  Content: "text content",
};

/** 官方黄金样本 §5.19：image 类型变体（官方括注逐字 + 同信封） */
const goldenDyMgImImage: WirePayload = {
  ToUserName: "appid",
  FromUserName: "openid",
  CreateTime: 1577364225,
  MsgType: "image",
  PicUrl: "this is image url link",
};

/** gift_delivery 礼包推送：官方未公开报文明细（待核验），按推送信封形态 +
 *  MsgType 占位装载（适配器按该值派生 x-msg-type=gift_delivery 头） */
const goldenDyMgGift: WirePayload = {
  ToUserName: "tt12321",
  FromUserName: "openid",
  CreateTime: 1577364225,
  MsgType: "gift_delivery",
};

/** verify_request 验证请求：官方只公开头集合（验签通过回 HTTP 200 即保存成功），
 *  报文体未公开（待核验），模板以空对象装载 */
const goldenDyMgVerify: WirePayload = {};

export const DOUYIN_MINI_GAME_SCHEMAS = [
  defineSchema(DOUYIN_DEFINITIONS, "dy-mg-verify", {
    eventName: "verify_request",
    name: "推送验证请求（握手）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: MINI_GAME_EXPECTED,
    idGenerations: [],
    payload: goldenDyMgVerify,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-mg-gift", {
    eventName: "gift_delivery",
    name: "礼包推送",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: MINI_GAME_EXPECTED,
    idGenerations: [{ path: "CreateTime", kind: "createTimeSecNumber" }],
    payload: goldenDyMgGift,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-mg-im-text", {
    eventName: "douyin_microgame_im",
    name: "客服消息 · 文本",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: MINI_GAME_EXPECTED,
    idGenerations: [{ path: "CreateTime", kind: "createTimeSecNumber" }],
    payload: goldenDyMgImText,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-mg-im-image", {
    eventName: "douyin_microgame_im",
    name: "客服消息 · 图片",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: MINI_GAME_EXPECTED,
    idGenerations: [{ path: "CreateTime", kind: "createTimeSecNumber" }],
    payload: goldenDyMgImImage,
  }),
] as const;
