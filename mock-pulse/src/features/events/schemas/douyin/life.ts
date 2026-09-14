import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import { DOUYIN_DEFINITIONS, LIFE_EXPECTED } from "./shared";

/**
 * 抖音生活服务 WebHooks 事件（事实库 §3.1/§3.3/§5.17，逐字）：
 * 验签 X-Douyin-Signature = sha1(AppSecret + 去换行 body)（与 dop 同头名、
 * 不同 key 语义与 2.5s 应答窗口）；verify_webhook 验证请求与 dop 同款。
 */

/** 官方黄金样本 §3.1：verify_webhook 验证请求（逐字；challenge 为数字） */
const goldenDyVerifyWebhook: WirePayload = {
  event: "verify_webhook",
  client_key: "",
  content: {
    challenge: 12345,
  },
};

/** 官方黄金样本 §5.17：life_trade_order_notify（逐字，content 为 json 字符串） */
const goldenDyLifeOrder: WirePayload = {
  event: "life_trade_order_notify",
  client_key: "axxxxxxxxxxxxx",
  content:
    '{"action": "pay_success","msg_time": 1665991178,"order": {"order_id": "123","pay_amount": 1,  "original_amount": 1,  "account_id": "123","create_time": 1665991178,"pay_time": 1665991178}}',
  log_id: "202210101930530102281180650970B5AF",
};

export const DOUYIN_LIFE_SCHEMAS = [
  defineSchema(DOUYIN_DEFINITIONS, "dy-verify-webhook", {
    eventName: "verify_webhook",
    name: "回调验证 · challenge 握手",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: LIFE_EXPECTED,
    idGenerations: [],
    payload: goldenDyVerifyWebhook,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-life-order", {
    eventName: "life_trade_order_notify",
    name: "生活服务订单通知",
    kind: "event",
    contentString: true,
    wire: "json",
    expected: LIFE_EXPECTED,
    idGenerations: [
      { path: "log_id", kind: "logId" },
      { path: "content.msg_time", kind: "createTimeSecNumber" },
    ],
    payload: goldenDyLifeOrder,
  }),
] as const;
