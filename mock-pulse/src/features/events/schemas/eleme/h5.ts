import { defineSchema } from "../define";
import type { EventSchema } from "../types";
import { ELE_DEFINITIONS, ELE_EXPECTED } from "./shared";

/**
 * H5 表单推送（事实库 §5.6 h5/api/order 全文逐字转表）：push_action 1 新订单 /
 * 2 订单状态更新，POST application/x-www-form-urlencoded——复用 #44 交付的
 * form 线上形态（wire = form）。每推送动作一模板，两动作穷尽 §5.6 目录。
 * 官方仅给字段表未给载荷样本：字段族 = §5.6 五字段逐字（push_action/
 * order_id/user_id/new_status/user_state），值取事实库同源/模拟器占位并在
 * 字段说明注明（不作官方样本）；表单线上值恒为文本——标量按线上文本形态
 * 存储（同美团先例）。系统级 consumer_key/timestamp/sig 由 Rust 适配器直发
 * 时补进 Query String（§4.1 系统参数一律放 Query）。
 */

/** 官方 §5.6 字段表逐字 + 两推送动作（1 新订单 / 2 订单状态更新） */
const H5_PUSHES = [
  {
    id: "ele-h5-order-create",
    eventName: "H5 新订单推送",
    name: "H5 新订单推送（push_action=1）",
    pushAction: "1",
    newStatus: "0",
  },
  {
    id: "ele-h5-order-status-update",
    eventName: "H5 订单状态更新推送",
    name: "H5 订单状态更新推送（push_action=2）",
    pushAction: "2",
    newStatus: "2",
  },
] as const;

export const ELE_H5_SCHEMAS: readonly EventSchema[] = H5_PUSHES.map((push) =>
  defineSchema(ELE_DEFINITIONS, push.id, {
    eventName: push.eventName,
    name: push.name,
    kind: "event",
    contentString: false,
    wire: "form",
    expected: ELE_EXPECTED,
    // H5 线订单号官方未给格式样本（§5.6 仅字段名），不作重生成声明
    idGenerations: [],
    payload: {
      push_action: push.pushAction,
      order_id: "12637645858619059",
      user_id: "12345",
      new_status: push.newStatus,
      user_state: "USER_STATE",
    },
  }),
);
