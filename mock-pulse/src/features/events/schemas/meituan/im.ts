import { defineSchema } from "../define";
import type { EventSchema } from "../types";
import { MT_DEFINITIONS, MT_IM_EXPECTED } from "./shared";

/**
 * IM 单聊消息回调（事实库 §2.4/§5.4 docDetail/842 字段表逐字）：用户或商家
 * 发会话消息时推给服务商（服务商自己经接口发出的消息不回推）。载荷为表单
 * 字段集（wire = form），骨架从简只收实锤四字段——biz_type 固定 1 /
 * app_poi_code / push_content（结构待核验(09-27)，占位值不作官方样本）/
 * extended_field（可选，留空即「没有值的参数也需拼接」形态）；应答大写 OK
 * 与订单类小写 ok 不同，照录。
 */

export const MT_IM_SCHEMAS: readonly EventSchema[] = [
  defineSchema(MT_DEFINITIONS, "mt-im-single-chat", {
    eventName: "消息回调-单聊消息",
    name: "IM 单聊消息回调（biz_type=1）",
    kind: "message",
    contentString: false,
    wire: "form",
    expected: MT_IM_EXPECTED,
    idGenerations: [],
    payload: {
      biz_type: "1",
      app_poi_code: "668921",
      push_content: "PUSH_CONTENT",
      extended_field: "",
    },
  }),
];
