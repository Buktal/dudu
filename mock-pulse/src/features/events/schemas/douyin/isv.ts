import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import { DOUYIN_DEFINITIONS, ISV_EXPECTED } from "./shared";

/**
 * 抖音服务商（第三方小程序）推送体系（事实库 §2 体系 C/§4.3，逐字）：
 * {Nonce, TimeStamp, Encrypt, MsgSignature} 信封；官方无独立 challenge，
 * 授权事件 URL 直接推送，目标必须直接返回 success（不带引号）。
 * Encrypt 为密文原样透传（AES 参数官方待核验）；Nonce/TimeStamp/MsgSignature
 * 是动态要素，适配器直发时按连接配置的 TOKEN 重生成并重签。
 */

/** 官方黄金信封 §4.3（逐字）：component_ticket 与授权类事件共用同一信封形态 */
const goldenDyIsvEnvelope: WirePayload = {
  Nonce: "4464221",
  TimeStamp: "1535551395",
  Encrypt: "Encrypt xxxx",
  MsgSignature: "ba394c04acece6c2c0edee058c5dddf82474b8ee",
};

export const DOUYIN_ISV_SCHEMAS = [
  defineSchema(DOUYIN_DEFINITIONS, "dy-isv-ticket", {
    eventName: "component_ticket",
    name: "component_ticket 推送信封",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: ISV_EXPECTED,
    idGenerations: [],
    payload: goldenDyIsvEnvelope,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-isv-authorized", {
    eventName: "authorized",
    name: "授权事件推送信封",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: ISV_EXPECTED,
    idGenerations: [],
    // 官方未公开授权类事件名明细（事件名在 Encrypt 密文内），按授权推送形态装载
    payload: goldenDyIsvEnvelope,
  }),
] as const;
