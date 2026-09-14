import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import { FEISHU_DEFINITIONS, FEISHU_VERIFICATION_EXPECTED } from "./shared";

/**
 * 飞书首次验证握手（事实库 §3.2/§5.1，逐字）：平台保存回调地址时 POST
 * url_verification 三参请求，服务须 1 秒内原样回显 challenge。配置 Encrypt
 * Key 时请求体整体加密为 `{"encrypt":"…"}`（解密后即本模板明文），由 Rust
 * 适配器按连接配置路由；模拟目标侧配置时的自测 curl 与官方 FAQ 命令同构。
 */

/** 官方黄金样本 §5.1：url_verification 验证请求（逐字，现行事件页口径） */
const goldenUrlVerification: WirePayload = {
  challenge: "ajls384kdjxxxx",
  token: "xxxxxx",
  type: "url_verification",
};

export const FEISHU_VERIFICATION_SCHEMAS = [
  defineSchema(FEISHU_DEFINITIONS, "fs-url-verification", {
    eventName: "url_verification",
    name: "回调验证 · challenge 握手",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: FEISHU_VERIFICATION_EXPECTED,
    idGenerations: [],
    payload: goldenUrlVerification,
  }),
] as const;
