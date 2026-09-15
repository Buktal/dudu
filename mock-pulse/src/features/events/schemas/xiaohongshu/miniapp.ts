import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  XHS_DEFINITIONS,
  XHS_MINIAPP_EXPECTED,
  xhsMessageEnvelope,
  xhsMessageIdGenerations,
  xhsPayResultIdGenerations,
} from "./shared";

/**
 * 小红书小程序客服消息（事实库 §10.3，5 MsgType）+ 支付结果回调
 * （事实库 §11.1，主单/预约单）：
 * - 客服消息 5 MsgType：text 官方样本逐字（Content 官方以占位 ... 示意）；
 *   image/video/item/order 官方仅给字段名（PicUrl/VideoUrl/OutProductId/
 *   OutOrderId），占位按官方大写下划线风格构造
 * - PAY_RESULT 主单（OrderType=1）与预约单（OrderType=2，OutBookOrderId 替代
 *   OutOrderId）：官方字段表逐字（DC753163），无逐字样本，样本值按事实库
 *   掩码风格构造（P01、OUT01 等后接星号掩码），Status/PayChannel/ProductType
 *   取官方枚举语义值
 * 载荷为解密后明文；加密信封 {Nonce,Timestamp,Encrypt,MsgSignature} 与 AES
 * （官方 MsgDecrypt 同族）由 Rust 适配器完成。
 */

/** 官方样本 §10.3 逐字：文本客服消息（CreateTime=1648714429、Content 占位 ...） */
const GOLDEN_TEXT: WirePayload = xhsMessageEnvelope("text", {
  Content: "...",
});

/** §10.3 字段表：image 专属字段 PicUrl（官方无样本值，占位构造） */
const GOLDEN_IMAGE: WirePayload = xhsMessageEnvelope("image", {
  PicUrl: "PIC_URL",
});

/** §10.3 字段表：video 专属字段 VideoUrl */
const GOLDEN_VIDEO: WirePayload = xhsMessageEnvelope("video", {
  VideoUrl: "VIDEO_URL",
});

/** §10.3 字段表：item 专属字段 OutProductId */
const GOLDEN_ITEM: WirePayload = xhsMessageEnvelope("item", {
  OutProductId: "OUT_PRODUCT_ID",
});

/** §10.3 字段表：order 专属字段 OutOrderId */
const GOLDEN_ORDER: WirePayload = xhsMessageEnvelope("order", {
  OutOrderId: "OUT_ORDER_ID",
});

/**
 * §11.1 OrderType=1 主订单通知：字段表逐字（Event 固定 PAY_RESULT，OrderType
 * 为判别字段殿后于 Event）；样本值按掩码风格构造，Status=2（支付成功）/
 * PayChannel=1（微信）/TotalAmount 单位分/ProductType=1（团购券）。
 */
const GOLDEN_PAY_RESULT: WirePayload = {
  Event: "PAY_RESULT",
  OrderType: 1,
  OrderId: "P01****",
  OutOrderId: "OUT01****",
  Status: 2,
  PayChannel: 1,
  TotalAmount: 9900,
  VoucherInfos: [{ VoucherCode: "VC01****" }],
  ProductType: 1,
  PayTime: 1693500000,
};

/**
 * §11.1 OrderType=2 预约单通知：OutBookOrderId 替代 OutOrderId、ProductType
 * 取 3（日历商品），其余字段与主单同表。
 */
const GOLDEN_PAY_RESULT_BOOK: WirePayload = {
  Event: "PAY_RESULT",
  OrderType: 2,
  OrderId: "P01****",
  OutBookOrderId: "BOOK01****",
  Status: 2,
  PayChannel: 1,
  TotalAmount: 9900,
  VoucherInfos: [{ VoucherCode: "VC01****" }],
  ProductType: 3,
  PayTime: 1693500000,
};

export const XHS_MINIAPP_SCHEMAS = [
  defineSchema(XHS_DEFINITIONS, "xhs-text", {
    eventName: "text",
    name: "客服文本消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: XHS_MINIAPP_EXPECTED,
    idGenerations: xhsMessageIdGenerations(),
    payload: GOLDEN_TEXT,
  }),
  defineSchema(XHS_DEFINITIONS, "xhs-image", {
    eventName: "image",
    name: "客服图片消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: XHS_MINIAPP_EXPECTED,
    idGenerations: xhsMessageIdGenerations(),
    payload: GOLDEN_IMAGE,
  }),
  defineSchema(XHS_DEFINITIONS, "xhs-video", {
    eventName: "video",
    name: "客服视频消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: XHS_MINIAPP_EXPECTED,
    idGenerations: xhsMessageIdGenerations(),
    payload: GOLDEN_VIDEO,
  }),
  defineSchema(XHS_DEFINITIONS, "xhs-item", {
    eventName: "item",
    name: "客服商品消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: XHS_MINIAPP_EXPECTED,
    idGenerations: xhsMessageIdGenerations(),
    payload: GOLDEN_ITEM,
  }),
  defineSchema(XHS_DEFINITIONS, "xhs-order", {
    eventName: "order",
    name: "客服订单消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: XHS_MINIAPP_EXPECTED,
    idGenerations: xhsMessageIdGenerations(),
    payload: GOLDEN_ORDER,
  }),
  defineSchema(XHS_DEFINITIONS, "xhs-pay-result", {
    eventName: "PAY_RESULT",
    name: "支付结果回调（主订单）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: XHS_MINIAPP_EXPECTED,
    idGenerations: xhsPayResultIdGenerations(),
    payload: GOLDEN_PAY_RESULT,
  }),
  defineSchema(XHS_DEFINITIONS, "xhs-pay-result-book", {
    eventName: "PAY_RESULT",
    name: "支付结果回调（预约单）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: XHS_MINIAPP_EXPECTED,
    idGenerations: xhsPayResultIdGenerations(),
    payload: GOLDEN_PAY_RESULT_BOOK,
  }),
] as const;
