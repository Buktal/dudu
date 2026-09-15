import { defineSchema } from "../define";
import type { EventSchema, WirePayload } from "../types";
import { PDD_DEFINITIONS, PDD_EXPECTED } from "./shared";

/**
 * 订单三态推送（事实库 §2.1 订单状态口径照录逐字——「第一步：已成交…订单
 * 状态：1-待发货；第二步：卖家发货，订单状态：2-已发货代签收；第三步：消费者
 * 确认收货，订单状态：3-已签收」；前提 confirm_status=1 已成交）：每状态一
 * 模板，三态穷尽。推送 topic 精确名与载荷正文 → 待核验(09-27)（§7.1，门户
 * SPA 未摘到），骨架只收官方实锤：order_status（§5.1 官方请求参数逐字，JSON
 * number 形态同官方 body 逐字）+ order_id（事实库模拟口径「轻量变更通知含
 * 订单号」，JSON 字段名未摘到 → 通名暂代并注明），不编造信封字段。
 */

/** 官方订单状态三态（§2.1 照录逐字；eventName 即官方照录的状态词汇） */
const ORDER_STATES = [
  { value: 1, label: "待发货", eventName: "1-待发货" },
  { value: 2, label: "已发货代签收", eventName: "2-已发货代签收" },
  { value: 3, label: "已签收", eventName: "3-已签收" },
] as const;

/** 模板 id 的状态段（kebab 形态，与状态三态一一对应） */
const ORDER_STATE_IDS = ["wait-delivery", "shipped", "signed"] as const;

/** 订单推送骨架（order_status 官方参数逐字 number 形态；订单号取官方数字串样本形态） */
function orderSkeleton(status: number): WirePayload {
  return { order_id: "123456789", order_status: status };
}

export const PDD_ORDER_SCHEMAS: readonly EventSchema[] = ORDER_STATES.map(
  (state, index) =>
    defineSchema(PDD_DEFINITIONS, `pdd-order-${ORDER_STATE_IDS[index]}`, {
      eventName: state.eventName,
      name: `订单推送·${state.label}（order_status=${state.value}）`,
      kind: "event",
      contentString: false,
      wire: "json",
      expected: PDD_EXPECTED,
      idGenerations: [{ path: "order_id", kind: "pddBizId" }],
      payload: orderSkeleton(state.value),
    }),
);
