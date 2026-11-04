import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  KS_CS_EXPECTED,
  KS_DEFINITIONS,
  ksCsEnvelope,
  ksCsIdGenerations,
} from "./shared";

/**
 * 电商智能客服推送面六种（事实库 §6.5.3/§6.5.2/§6.2）：买家→商家消息异步
 * 推送（ISV 提供接口，地址线下报备），信封 `type` 判型（1 消息 / 2 转接）：
 * 心跳测试（§6.2 推送基座 {"test":true} 逐字）/ 文本 / 图片 / 商品卡片 /
 * 订单卡片 / 转接通知。message.content 各型官方释义：文本 {"text":"…"}、
 * 图片 uri 官方即空串（"原uri换为空字符串"，平台抹除原图链）、商品卡片
 * {"text":"$itemId"} 与订单卡片 {"orderId":"12345"} 官方示例逐字。
 * 推送侧 User 带 openId（与发送结构体不对称，§6.5.3 逐字）；fromUser 官方
 * 示例昵称 快手用户1234，商家昵称/买家 openId 无样本取占位。
 */

/** §6.2 推送基座心跳逐字：保存推送地址即触发的测试消息 {"test":true} */
const GOLDEN_HEARTBEAT: WirePayload = { test: true };

/** contentType=1 文本：content 官方 demo 示例形态 {"text":"你好"}（§7.4 逐字） */
const GOLDEN_TEXT: WirePayload = ksCsEnvelope(
  1,
  {
    contentType: 1,
    content: '{"text":"你好"}',
  },
  [],
);

/**
 * contentType=2 图片：content 官方字段形态 {"uri":"","width","height",
 * "contentLength"}——uri 官方即空串（平台抹除原图链），数值官方无样本取占位
 */
const GOLDEN_IMAGE: WirePayload = ksCsEnvelope(
  1,
  {
    contentType: 2,
    content: '{"uri":"","width":720,"height":720,"contentLength":102400}',
  },
  [],
);

/** contentType=1011 商品卡片：content 官方示例逐字 {"text":"$itemId"} */
const GOLDEN_ITEM_CARD: WirePayload = ksCsEnvelope(
  1,
  {
    contentType: 1011,
    content: '{"text":"$itemId"}',
  },
  [],
);

/** contentType=1012 订单卡片：content 官方示例逐字 {"orderId":"12345"} */
const GOLDEN_ORDER_CARD: WirePayload = ksCsEnvelope(
  1,
  {
    contentType: 1012,
    content: '{"orderId":"12345"}',
  },
  [],
);

/**
 * type=2 转接通知（§6.5.3 type 枚举 1 消息/2 转接）：transferList 携带
 * 转接目标客服（User role=3）；客服昵称无样本取占位，message 仍必填取文本形态
 */
const GOLDEN_TRANSFER: WirePayload = ksCsEnvelope(
  2,
  { contentType: 1, content: '{"text":"你好"}' },
  [{ nickName: "CUSTOMER_SERVICE_NICK_NAME", role: 3 }],
);

export const KS_CS_SCHEMAS = [
  defineSchema(KS_DEFINITIONS, "ks-cs-heartbeat", {
    eventName: "test",
    name: "心跳测试（保存推送地址即触发）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: KS_CS_EXPECTED,
    idGenerations: [],
    payload: GOLDEN_HEARTBEAT,
  }),
  defineSchema(KS_DEFINITIONS, "ks-cs-text", {
    eventName: "text",
    name: "客服文本消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: KS_CS_EXPECTED,
    idGenerations: ksCsIdGenerations(),
    payload: GOLDEN_TEXT,
  }),
  defineSchema(KS_DEFINITIONS, "ks-cs-image", {
    eventName: "image",
    name: "客服图片消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: KS_CS_EXPECTED,
    idGenerations: ksCsIdGenerations(),
    payload: GOLDEN_IMAGE,
  }),
  defineSchema(KS_DEFINITIONS, "ks-cs-item-card", {
    eventName: "item",
    name: "客服商品卡片消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: KS_CS_EXPECTED,
    idGenerations: ksCsIdGenerations(),
    payload: GOLDEN_ITEM_CARD,
  }),
  defineSchema(KS_DEFINITIONS, "ks-cs-order-card", {
    eventName: "order",
    name: "客服订单卡片消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: KS_CS_EXPECTED,
    idGenerations: ksCsIdGenerations(),
    payload: GOLDEN_ORDER_CARD,
  }),
  defineSchema(KS_DEFINITIONS, "ks-cs-transfer", {
    eventName: "transfer",
    name: "转接通知",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: KS_CS_EXPECTED,
    idGenerations: ksCsIdGenerations(),
    payload: GOLDEN_TRANSFER,
  }),
] as const;
