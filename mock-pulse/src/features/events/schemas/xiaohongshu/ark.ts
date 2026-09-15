import { defineSchema } from "../define";
import { XHS_ARK_EXPECTED, XHS_DEFINITIONS, xhsArkEnvelope } from "./shared";

/**
 * 电商 ark 订单推送族（事实库 §2.2，10 事件，[多源] zsmhub/xhs-sdk 与
 * cxjava/xhs-sdk 交叉一致）：履约 4（msg_fulfillment_status_change/
 * receiver_change/seller_remark_change/deliver_time_change）+ 售后 2
 * （msg_after_sale_create/transfer）+ 商品 4（msg_sku_create/buyable/
 * delete、msg_item_audit_reject）。
 * 模板载荷 = 单条推送信封 {msgTag,sellerId,data}（§2.1 字段名逐字）；线上
 * body 为该结构的 JSON 数组（批量推送），由 Rust 适配器包裹明文直发。
 * data 为内层业务 JSON 序列化字符串（二级转义）；字段命名不统一按事实库
 * 保留原样（request_from 下划线、openAddressId 两事件类型不同）。
 * 样本值口径：status_change 与 after_sale_create 取官方构造示例 §5.4 逐字；
 * 其余事件官方无样本值，按同风格掩码占位构造（字段名逐字）。
 */

/** 官方构造示例 §5.4 逐字：履约-订单状态变更（orderStatus=4 待发货） */
const GOLDEN_STATUS_CHANGE = xhsArkEnvelope(
  "msg_fulfillment_status_change",
  '{"orderId":"P01****","updateTime":1693500000,"orderStatus":4}',
);

/** §2.2 字段表构造：买家收货信息变更（openAddressId 为 string） */
const GOLDEN_RECEIVER_CHANGE = xhsArkEnvelope(
  "msg_fulfillment_receiver_change",
  '{"orderId":"P01****","openAddressId":"ADDR01****","updateTime":1693500002}',
);

/** §2.2 字段表构造：卖家修改备注 */
const GOLDEN_SELLER_REMARK_CHANGE = xhsArkEnvelope(
  "msg_fulfillment_seller_remark_change",
  '{"orderId":"P01****","operator":"OPER01****","sellerMarkNote":"勿放快递柜","updateTime":1693500003}',
);

/** §2.2 字段表构造：发货时效变更（openAddressId 为 int64，与 receiver_change 不同） */
const GOLDEN_DELIVER_TIME_CHANGE = xhsArkEnvelope(
  "msg_fulfillment_deliver_time_change",
  '{"orderId":"P01****","openAddressId":10001,"updateTime":1693500004}',
);

/** 官方构造示例 §5.4 逐字：发起售后申请（request_from 下划线命名保留原样） */
const GOLDEN_AFTER_SALE_CREATE = xhsArkEnvelope(
  "msg_after_sale_create",
  '{"returnsId":"R01****","orderId":"P01****","returnType":1,"request_from":1,"refundFee":9900,"updateTime":1693500001}',
);

/** §2.2 字段表构造（事实库「同上」与 create 同构）：售后类型变更（returnType=4 仅退款 new） */
const GOLDEN_AFTER_SALE_TRANSFER = xhsArkEnvelope(
  "msg_after_sale_transfer",
  '{"returnsId":"R01****","orderId":"P01****","returnType":4,"request_from":1,"refundFee":9900,"updateTime":1693500005}',
);

/** §2.2 字段表构造：商品新建 */
const GOLDEN_SKU_CREATE = xhsArkEnvelope(
  "msg_sku_create",
  '{"skuId":"SKU01****","updateTime":1693500006}',
);

/** §2.2 字段表构造：商品上下架 */
const GOLDEN_SKU_BUYABLE = xhsArkEnvelope(
  "msg_sku_buyable",
  '{"skuId":"SKU01****","updateTime":1693500007}',
);

/** §2.2 字段表构造：商品删除 */
const GOLDEN_SKU_DELETE = xhsArkEnvelope(
  "msg_sku_delete",
  '{"skuId":"SKU01****","updateTime":1693500008}',
);

/** §2.2 字段表构造：商品审核驳回 */
const GOLDEN_ITEM_AUDIT_REJECT = xhsArkEnvelope(
  "msg_item_audit_reject",
  '{"itemId":"I01****","updateTime":1693500009}',
);

export const XHS_ARK_SCHEMAS = [
  defineSchema(XHS_DEFINITIONS, "xhs-ark-fulfillment-status-change", {
    eventName: "msg_fulfillment_status_change",
    name: "ark 履约-订单状态变更",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: XHS_ARK_EXPECTED,
    idGenerations: [],
    payload: GOLDEN_STATUS_CHANGE,
  }),
  defineSchema(XHS_DEFINITIONS, "xhs-ark-fulfillment-receiver-change", {
    eventName: "msg_fulfillment_receiver_change",
    name: "ark 履约-买家收货信息变更",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: XHS_ARK_EXPECTED,
    idGenerations: [],
    payload: GOLDEN_RECEIVER_CHANGE,
  }),
  defineSchema(XHS_DEFINITIONS, "xhs-ark-fulfillment-seller-remark-change", {
    eventName: "msg_fulfillment_seller_remark_change",
    name: "ark 履约-卖家修改备注",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: XHS_ARK_EXPECTED,
    idGenerations: [],
    payload: GOLDEN_SELLER_REMARK_CHANGE,
  }),
  defineSchema(XHS_DEFINITIONS, "xhs-ark-fulfillment-deliver-time-change", {
    eventName: "msg_fulfillment_deliver_time_change",
    name: "ark 履约-发货时效变更",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: XHS_ARK_EXPECTED,
    idGenerations: [],
    payload: GOLDEN_DELIVER_TIME_CHANGE,
  }),
  defineSchema(XHS_DEFINITIONS, "xhs-ark-after-sale-create", {
    eventName: "msg_after_sale_create",
    name: "ark 售后-发起售后申请",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: XHS_ARK_EXPECTED,
    idGenerations: [],
    payload: GOLDEN_AFTER_SALE_CREATE,
  }),
  defineSchema(XHS_DEFINITIONS, "xhs-ark-after-sale-transfer", {
    eventName: "msg_after_sale_transfer",
    name: "ark 售后-售后类型变更",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: XHS_ARK_EXPECTED,
    idGenerations: [],
    payload: GOLDEN_AFTER_SALE_TRANSFER,
  }),
  defineSchema(XHS_DEFINITIONS, "xhs-ark-sku-create", {
    eventName: "msg_sku_create",
    name: "ark 商品-商品新建",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: XHS_ARK_EXPECTED,
    idGenerations: [],
    payload: GOLDEN_SKU_CREATE,
  }),
  defineSchema(XHS_DEFINITIONS, "xhs-ark-sku-buyable", {
    eventName: "msg_sku_buyable",
    name: "ark 商品-商品上下架",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: XHS_ARK_EXPECTED,
    idGenerations: [],
    payload: GOLDEN_SKU_BUYABLE,
  }),
  defineSchema(XHS_DEFINITIONS, "xhs-ark-sku-delete", {
    eventName: "msg_sku_delete",
    name: "ark 商品-商品删除",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: XHS_ARK_EXPECTED,
    idGenerations: [],
    payload: GOLDEN_SKU_DELETE,
  }),
  defineSchema(XHS_DEFINITIONS, "xhs-ark-item-audit-reject", {
    eventName: "msg_item_audit_reject",
    name: "ark 商品-商品审核驳回",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: XHS_ARK_EXPECTED,
    idGenerations: [],
    payload: GOLDEN_ITEM_AUDIT_REJECT,
  }),
] as const;
