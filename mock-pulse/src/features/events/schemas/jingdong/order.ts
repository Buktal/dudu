import { defineSchema } from "../define";
import type { EventSchema, WirePayload } from "../types";
import { JD_DEFINITIONS, JD_EXPECTED } from "./shared";

/**
 * 订单 9 状态推送（事实库 §2.1 状态枚举 orderStatusItem 逐字——枚举值即订单
 * 消息可能携带的全部实锤状态语义）：每状态一模板，全目录穷尽 9 枚举。
 * 订单消息类型精确名与载荷 → 待核验(09-27)（listId=520 未取得），骨架只收
 * 官方已实锤词汇：order_state（§5.1 官方订单查询参数名）+ order_id
 * （§5.1 optional_fields / §5.3 push2 参数表 orderId），不编造信封字段。
 */

/** 官方状态枚举与含义（§2.1 逐字；顺序即事实库表格序。label 为模板名短形，
 * meaning 为官方描述全文——全文以描述文件 order_state 字段说明为准） */
const ORDER_STATES = [
  { value: "WAIT_SELLER_STOCK_OUT", label: "等待出库", meaning: "等待出库" },
  {
    value: "WAIT_GOODS_RECEIVE_CONFIRM",
    label: "等待确认收货",
    meaning: "等待确认收货",
  },
  {
    value: "WAIT_SELLER_DELIVERY",
    label: "等待发货·仅海外购",
    meaning: "等待发货（仅海外购商家，境内发货标签）",
  },
  {
    value: "PAUSE",
    label: "暂停",
    meaning: "暂停（loc订单可通过此状态获取）",
  },
  { value: "FINISHED_L", label: "完成", meaning: "完成" },
  { value: "TRADE_CANCELED", label: "取消", meaning: "取消" },
  { value: "LOCKED", label: "已锁定", meaning: "已锁定" },
  {
    value: "POP_ORDER_PAUSE",
    label: "pop业务暂停",
    meaning: "pop业务暂停（3c号卡/履约/黄金）",
  },
  { value: "NOT_PAY", label: "未付款", meaning: "未付款" },
] as const;

/** 模板 id 的状态段（kebab 形态，与状态枚举一一对应） */
const ORDER_STATE_IDS = [
  "wait-seller-stock-out",
  "wait-goods-receive-confirm",
  "wait-seller-delivery",
  "pause",
  "finished-l",
  "trade-canceled",
  "locked",
  "pop-order-pause",
  "not-pay",
] as const;

/** 订单推送骨架（官方实锤词汇两字段；样本值取官方数字串订单号形态） */
function orderSkeleton(state: string): WirePayload {
  return { order_id: "123456789", order_state: state };
}

export const JD_ORDER_SCHEMAS: readonly EventSchema[] = ORDER_STATES.map(
  (state, index) =>
    defineSchema(JD_DEFINITIONS, `jd-order-${ORDER_STATE_IDS[index]}`, {
      eventName: state.value,
      name: `订单推送·${state.label}（${state.value}）`,
      kind: "event",
      contentString: false,
      wire: "json",
      expected: JD_EXPECTED,
      idGenerations: [{ path: "order_id", kind: "jdBizId" }],
      payload: orderSkeleton(state.value),
    }),
);
