import { defineSchema } from "../define";
import type { EventSchema, IdGeneration, WirePayload } from "../types";
import { ELE_DEFINITIONS, ELE_EXPECTED } from "./shared";

/**
 * v2 订单四推送（事实库 §2.1 目录 + §5.2–§5.5 官方载荷全文逐字）：每推送一
 * 模板，四推送穷尽用户线推送目录（§2.5 目录级已核验无商品/IM 推送）。载荷为
 * JSON 明文（wire = json），键序/number/string 形态逐字照录官方样本（官方
 * 时间戳字符串/数字混用，照录；extra 为 JSON 字符串形态；配送 state_code
 * 1234 为官方文档示意占位，照录并注明）。推送内无 topic/事件信封字段——
 * 订单状态推送的官方事件名即 push_action=2 的 order_status_update（§2.1 逐字），
 * 其余以目录行推送名照录。系统级 consumer_key/timestamp/sig 由 Rust 适配器
 * 直发时补进 Query String。
 */

/** 官方推送目录（§2.1 表「推送名/触发语义」列逐字；赔偿推送官方页首标注
 * 「暂时不对外开放」，载荷已全文核验故收录并在名称注明） */
const ORDER_PUSHES = [
  {
    id: "ele-order-status-update",
    eventName: "order_status_update",
    name: "订单状态推送（order_status_update）",
  },
  {
    id: "ele-order-delivery",
    eventName: "订单配送信息推送",
    name: "订单配送信息推送（order-delivery）",
  },
  {
    id: "ele-order-refund",
    eventName: "退单状态推送",
    name: "退单状态推送（order-refund）",
  },
  {
    id: "ele-order-compensate",
    eventName: "订单赔偿",
    name: "订单赔偿（order-compensate，官方标注暂不开放）",
  },
] as const;

/** 官方核验样本载荷（§5.2–§5.5 逐字：值/键序/number-string 形态照录） */
const GOLDEN_PAYLOADS: Record<
  (typeof ORDER_PUSHES)[number]["id"],
  WirePayload
> = {
  "ele-order-status-update": {
    push_action: 2,
    eleme_order_id: "12637645858619059",
    tp_order_id: "1425223342",
    new_status: 1,
    extra: "{}",
    created_at: "1531987437",
  },
  "ele-order-delivery": {
    eleme_order_id: "12374793708765809",
    tp_order_id: "1425223342",
    deliveryman_name: "李四",
    deliveryman_phone: "13800001234",
    state_code: 1234,
    update_at: 1463943884,
  },
  "ele-order-refund": {
    status_code: 1,
    role: 1,
    eleme_order_id: "100025663239521904",
    tp_order_id: "tb1020303434342",
    update_at: 1458721474,
  },
  "ele-order-compensate": {
    compensate_type: 1,
    action: 1,
    hongbao_id: "1234",
    eleme_order_id: "100967782022644505",
    tp_order_id: "212433333745",
    phone: "18843225250",
    amount: 2.7,
    sum_condition: 27,
    begin_date: "2016-07-01",
    end_date: "2016-07-31",
    created_at: 1469361386,
  },
};

/** ID 生成规则：饿了么订单号重生成（纯数字字符串，17~18 位官方样本同族） */
function idGenerationsOf(payload: WirePayload): IdGeneration[] {
  return "eleme_order_id" in payload
    ? [{ path: "eleme_order_id", kind: "eleBizId" }]
    : [];
}

export const ELE_ORDER_SCHEMAS: readonly EventSchema[] = ORDER_PUSHES.map(
  (push) => {
    const payload = GOLDEN_PAYLOADS[push.id];
    return defineSchema(ELE_DEFINITIONS, push.id, {
      eventName: push.eventName,
      name: push.name,
      kind: "event",
      contentString: false,
      wire: "json",
      expected: ELE_EXPECTED,
      idGenerations: idGenerationsOf(payload),
      payload,
    });
  },
);
