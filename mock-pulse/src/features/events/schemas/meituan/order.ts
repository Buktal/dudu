import { defineSchema } from "../define";
import type { EventSchema } from "../types";
import {
  MT_DEFINITIONS,
  MT_ORDER_EXPECTED,
  MT_ORDER_ID_GENERATIONS,
  mtOrderPayload,
} from "./shared";

/**
 * 订单三态推送（事实库 §2.1 目录行官方接口名逐字 + docDetail/177/180 状态码
 * 口径）：每推送项一模板，三态取必接与官方展开全文的推送——已支付（status=2，
 * food/7 必接）/ 已确认（status=4，docDetail/177）/ 已完成（status=8，
 * docDetail/180）。载荷为表单字段集（wire = form，§3.1 所有参数均为普通
 * POST 表单参数而非 JSON），字段族 = §5.3 核验样本逐字（三态共用，官方
 * 「已订阅字段在已支付/已确认/已完成三种推送中同时生效」），推送类型由
 * 回调 URL 区分，载荷内无实锤 status 字段不编造。系统级 app_id/timestamp/
 * sig 由 Rust 适配器直发时补齐。
 */

/** 官方推送项（§2.1 目录行接口名逐字 + 状态码 docDetail 照录） */
const ORDER_PUSHES = [
  {
    id: "mt-order-paid",
    eventName: "推送已支付订单",
    name: "订单推送·已支付（status=2，必接）",
  },
  {
    id: "mt-order-confirmed",
    eventName: "推送已确认订单",
    name: "订单推送·已确认（status=4）",
  },
  {
    id: "mt-order-completed",
    eventName: "推送已完成订单",
    name: "订单推送·已完成（status=8）",
  },
] as const;

export const MT_ORDER_SCHEMAS: readonly EventSchema[] = ORDER_PUSHES.map(
  (push) =>
    defineSchema(MT_DEFINITIONS, push.id, {
      eventName: push.eventName,
      name: push.name,
      kind: "event",
      contentString: false,
      wire: "form",
      expected: MT_ORDER_EXPECTED,
      idGenerations: MT_ORDER_ID_GENERATIONS,
      payload: mtOrderPayload(),
    }),
);
