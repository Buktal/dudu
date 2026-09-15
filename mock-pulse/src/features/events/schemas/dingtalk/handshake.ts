import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import { DINGTALK_DEFINITIONS, DINGTALK_ENCRYPTED_EXPECTED } from "./shared";

/**
 * 钉钉回调握手系（事实库 §5.6/§2.6 解密后明文，逐字）：平台保存/更新回调
 * 地址时推送 check_url / check_create_suite_url / check_update_suite_url，
 * 套件票据 suite_ticket 每 5 小时推一次（不回 success 加密包会连推至 100 次）。
 * 线上形态为 `{"encrypt":"…"}` 密文信封（解密后即本模板明文），由 Rust
 * 适配器按连接配置加密封装与验签。
 */

/** 官方黄金样本 §5.6：check_url 解密后明文（逐字） */
const goldenCheckUrl: WirePayload = {
  EventType: "check_url",
};

/** 官方黄金样本 §5.6：check_create_suite_url 解密后明文（逐字） */
const goldenCheckCreateSuiteUrl: WirePayload = {
  EventType: "check_create_suite_url",
  Random: "brdkKLMW",
};

/** 官方黄金样本 §5.6：check_update_suite_url 解密后明文（逐字；页内两节同形照录） */
const goldenCheckUpdateSuiteUrl: WirePayload = {
  EventType: "check_update_suite_url",
  Random: "xxxxxx",
  TestSuiteKey: "suited6db0pze8yao1b1y",
};

/** 官方黄金样本 §5.6：suite_ticket 解密后明文（逐字；TimeStamp 为数字型） */
const goldenSuiteTicket: WirePayload = {
  SuiteKey: "xxxxxx",
  EventType: "suite_ticket",
  TimeStamp: 123456,
  SuiteTicket: "xxxxxx",
};

export const DINGTALK_HANDSHAKE_SCHEMAS = [
  defineSchema(DINGTALK_DEFINITIONS, "dt-check-url", {
    eventName: "check_url",
    name: "回调测试地址 · check_url 握手",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: DINGTALK_ENCRYPTED_EXPECTED,
    idGenerations: [],
    payload: goldenCheckUrl,
  }),
  defineSchema(DINGTALK_DEFINITIONS, "dt-check-create-suite-url", {
    eventName: "check_create_suite_url",
    name: "新建回调地址验证",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: DINGTALK_ENCRYPTED_EXPECTED,
    idGenerations: [],
    payload: goldenCheckCreateSuiteUrl,
  }),
  defineSchema(DINGTALK_DEFINITIONS, "dt-check-update-suite-url", {
    eventName: "check_update_suite_url",
    name: "更新回调地址验证",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: DINGTALK_ENCRYPTED_EXPECTED,
    idGenerations: [],
    payload: goldenCheckUpdateSuiteUrl,
  }),
  defineSchema(DINGTALK_DEFINITIONS, "dt-suite-ticket", {
    eventName: "suite_ticket",
    name: "套件票据",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: DINGTALK_ENCRYPTED_EXPECTED,
    // SuiteTicket 以最新值为准（5h 一推）；推送时刻按当前毫秒重生成
    idGenerations: [{ path: "TimeStamp", kind: "createTimeMs" }],
    payload: goldenSuiteTicket,
  }),
] as const;
