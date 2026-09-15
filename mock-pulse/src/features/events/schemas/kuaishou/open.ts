import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  KS_DEFINITIONS,
  KS_EXPECTED,
  KS_OPEN_TIMESTAMP,
  ksEnvelopeIdGenerations,
  ksOpenEnvelope,
} from "./shared";

/**
 * 开放平台 WebHook 事件三种（事实库 §2.1，`event` 判型，全目录穷尽仅此三个
 * ——官方文档站 bundle 路由枚举实锤，无第 4 个事件路由）：
 * TEST（配地址握手，保存回调地址即触发验证）/ AUTHORIZE（授权）/ UN_AUTHORIZE
 * （解除授权，官方即此下划线命名）。载荷按 §2.1 信封五字段 + §3.1/各事件页
 * data 字段表构造：TEST data 时间戳取官方样本逐字，scope 取官方示例列表，
 * open_id 官方无样本取占位。
 */

/** 官方样本 §3.1：TEST 配地址测试事件（data 只含测试时间戳，与信封同值） */
const GOLDEN_TEST: WirePayload = ksOpenEnvelope("TEST", {
  timestamp: KS_OPEN_TIMESTAMP,
});

/** §2.1 授权事件：scope 取官方示例列表，is_new 官方字段表（是否新授权用户） */
const GOLDEN_AUTHORIZE: WirePayload = ksOpenEnvelope("AUTHORIZE", {
  open_id: "OPEN_ID",
  scope: ["user_info", "user_video_info"],
  is_new: true,
});

/** §2.1 解除授权事件：data 为 open_id + 撤销的 scope 列表 */
const GOLDEN_UN_AUTHORIZE: WirePayload = ksOpenEnvelope("UN_AUTHORIZE", {
  open_id: "OPEN_ID",
  scope: ["user_info", "user_video_info"],
});

export const KS_OPEN_EVENT_SCHEMAS = [
  defineSchema(KS_DEFINITIONS, "ks-test", {
    eventName: "TEST",
    name: "测试事件（配地址握手）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: KS_EXPECTED,
    idGenerations: [
      ...ksEnvelopeIdGenerations(),
      // data.timestamp 与信封 timestamp 同值（官方测试语义：回显测试时间戳）
      { path: "data.timestamp", kind: "createTimeMs", sameAs: "timestamp" },
    ],
    payload: GOLDEN_TEST,
  }),
  defineSchema(KS_DEFINITIONS, "ks-authorize", {
    eventName: "AUTHORIZE",
    name: "授权事件",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: KS_EXPECTED,
    idGenerations: ksEnvelopeIdGenerations(),
    payload: GOLDEN_AUTHORIZE,
  }),
  defineSchema(KS_DEFINITIONS, "ks-un-authorize", {
    eventName: "UN_AUTHORIZE",
    name: "解除授权事件",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: KS_EXPECTED,
    idGenerations: ksEnvelopeIdGenerations(),
    payload: GOLDEN_UN_AUTHORIZE,
  }),
] as const;
