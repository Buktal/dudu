import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  TB_DEFINITIONS,
  TB_EXPECTED,
  tbGlobalEnvelope,
  tbGlobalIdGenerations,
} from "./shared";

/**
 * 全球栈 HTTP 回调正向/逆向示例（事实库 §5.6 接收消息页 119493 逐字，键序
 * 同官方文档）：正向（下单/付款/发货/收货）与逆向（取消/退货退款）。信封
 * 五字段 seller_id/message_type/data/timestamp/site，data 只含必要标识信息
 * （业务详情须回查 API，事实库 §3.2 处理规范）。
 */

/** 官方样本 §5.6 正向：下单未付款（data 键序 order_status/trade_order_id/…） */
const GOLDEN_FORWARD: WirePayload = tbGlobalEnvelope(
  "1234567",
  {
    order_status: "unpaid",
    trade_order_id: "260422900198363",
    trade_order_line_id: "260422900298363",
    status_update_time: 1603698638,
  },
  1603766859530,
);

/** 官方样本 §5.6 逆向：订单取消/退货退款（data 带 reverse_order_* 关联主单） */
const GOLDEN_REVERSE: WirePayload = tbGlobalEnvelope(
  "1000114855",
  {
    order_status: "canceled",
    reverse_order_id: "501977696648153",
    reverse_order_line_id: "502491640048153",
    status_update_time: 1603703663,
    trade_order_id: "252883361348153",
    trade_order_line_id: "252883361948153",
  },
  1603715010436,
);

export const TB_GLOBAL_SCHEMAS = [
  defineSchema(TB_DEFINITIONS, "tb-global-forward", {
    // 信封无 event 字段，判型字段为 data.order_status（同微博 type 判型取值口径）
    eventName: "unpaid",
    name: "全球栈正向订单推送（下单未付款）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: TB_EXPECTED,
    idGenerations: tbGlobalIdGenerations(),
    payload: GOLDEN_FORWARD,
  }),
  defineSchema(TB_DEFINITIONS, "tb-global-reverse", {
    eventName: "canceled",
    name: "全球栈逆向订单推送（取消/退货退款）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: TB_EXPECTED,
    idGenerations: tbGlobalIdGenerations(),
    payload: GOLDEN_REVERSE,
  }),
] as const;
