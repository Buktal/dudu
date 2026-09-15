import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import { TB_DEFINITIONS, TB_EXPECTED } from "./shared";

/**
 * 交易/退款代表事件（事实库 §5.3/§5.4 TOP topic 核验载荷页逐字）：
 * TradeCreate（apiId=101，买家下单，伴生 TradeAlipayCreate）与
 * RefundCreated（apiId=118，买家申请退款）。字段全字符串型数字（tid/oid/
 * refund_id 恒字符串）；交易 status 仅 4 态支付口径、无已发货态（事实库 §2.1），
 * 详情必须回查 API（通知+回查幂等模式）。
 */

/** 官方样本 §5.3：taobao_trade_TradeCreate 载荷逐字（键序同官方文档） */
const GOLDEN_TRADE_CREATE: WirePayload = {
  buyer_nick: "碎**",
  buyer_open_uid: "AAGq5d-EAAeG3JedwSFpZMe1",
  payment: "100.00",
  oid: "987654321",
  seller_nick: "麦包包",
  type: "fixed",
  tid: "123456789",
  status: "TRADE_CREATE",
};

/** 官方样本 §5.4：taobao_refund_RefundCreated 载荷逐字（键序同官方文档） */
const GOLDEN_REFUND_CREATED: WirePayload = {
  buyer_nick: "碎**",
  buyer_open_uid: "AAGq5d-EAAeG3JedwSFpZMe1",
  refund_phase: "onsale",
  refund_fee: "21.32",
  bill_type: "refund_bill",
  modified: "2000-12-30 12:32:20",
  oid: "110770592823138",
  seller_nick: "麦包包",
  refund_id: "592823138",
  tid: "110770592823138",
};

/** tid/oid/refund_id：数字串形态的排重幂等键，新建事件时全部重生成 */
function tradeIdGenerations(): { path: string; kind: "taobaoBizId" }[] {
  return [
    { path: "tid", kind: "taobaoBizId" },
    { path: "oid", kind: "taobaoBizId" },
  ];
}

export const TB_TRADE_SCHEMAS = [
  defineSchema(TB_DEFINITIONS, "tb-trade-create", {
    eventName: "taobao_trade_TradeCreate",
    name: "交易创建推送（TradeCreate）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: TB_EXPECTED,
    idGenerations: tradeIdGenerations(),
    payload: GOLDEN_TRADE_CREATE,
  }),
  defineSchema(TB_DEFINITIONS, "tb-refund-created", {
    eventName: "taobao_refund_RefundCreated",
    name: "退款创建推送（RefundCreated）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: TB_EXPECTED,
    idGenerations: [
      ...tradeIdGenerations(),
      { path: "refund_id", kind: "taobaoBizId" },
      { path: "modified", kind: "taobaoModified" },
    ],
    payload: GOLDEN_REFUND_CREATED,
  }),
] as const;
