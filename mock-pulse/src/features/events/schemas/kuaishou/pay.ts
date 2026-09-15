import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  KS_DEFINITIONS,
  KS_EXPECTED,
  ksEnvelopeIdGenerations,
  ksPayEnvelope,
} from "./shared";

/**
 * 小程序支付回调族五种（事实库 §2.2，`biz_type` 判型，信封无 event 字段）：
 * PAYMENT（支付）/ REFUND（退款）/ SETTLE（结算）/ WITHHOLD（周期代扣）/
 * CONTRACT（签约/解约）。信封按 §4.1 官方 toSignStr 键序逐字（样本值
 * message_id/app_id/timestamp 照录）；data 按各页字段表与官方枚举构造——
 * 状态枚举取成功态，SETTLE 事实库未录字段表留空不编造，官方拼写 PAY_FAILD
 * 原文保留。
 */

/** 支付状态成功态（§2.2 官方枚举 PROCESSING/SUCCESS/FAILED） */
const GOLDEN_PAYMENT: WirePayload = ksPayEnvelope("PAYMENT", {
  status: "SUCCESS",
});

/** 退款完成（§2.2 同族枚举；refund_type 线上取值未核验不进模板） */
const GOLDEN_REFUND: WirePayload = ksPayEnvelope("REFUND", {
  status: "SUCCESS",
});

/** 结算成功（分账到可提现账户；事实库无字段表，data 留空不编造） */
const GOLDEN_SETTLE: WirePayload = ksPayEnvelope("SETTLE", {});

/** 周期代扣成功（§2.2 官方枚举 PAY_SUCCESS/PAY_FAILD，官方拼写原文如此） */
const GOLDEN_WITHHOLD: WirePayload = ksPayEnvelope("WITHHOLD", {
  withhold_state: "PAY_SUCCESS",
});

/** 签约成功（§2.2 官方枚举 CONTRACT_SUCCESS/UNCONTRACT_SUCCESS） */
const GOLDEN_CONTRACT: WirePayload = ksPayEnvelope("CONTRACT", {
  contract_status: "CONTRACT_SUCCESS",
});

export const KS_PAY_SCHEMAS = [
  defineSchema(KS_DEFINITIONS, "ks-payment", {
    eventName: "PAYMENT",
    name: "支付结果回调",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: KS_EXPECTED,
    idGenerations: ksEnvelopeIdGenerations(),
    payload: GOLDEN_PAYMENT,
  }),
  defineSchema(KS_DEFINITIONS, "ks-refund", {
    eventName: "REFUND",
    name: "退款结果回调",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: KS_EXPECTED,
    idGenerations: ksEnvelopeIdGenerations(),
    payload: GOLDEN_REFUND,
  }),
  defineSchema(KS_DEFINITIONS, "ks-settle", {
    eventName: "SETTLE",
    name: "结算结果回调",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: KS_EXPECTED,
    idGenerations: ksEnvelopeIdGenerations(),
    payload: GOLDEN_SETTLE,
  }),
  defineSchema(KS_DEFINITIONS, "ks-withhold", {
    eventName: "WITHHOLD",
    name: "周期代扣回调",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: KS_EXPECTED,
    idGenerations: ksEnvelopeIdGenerations(),
    payload: GOLDEN_WITHHOLD,
  }),
  defineSchema(KS_DEFINITIONS, "ks-contract", {
    eventName: "CONTRACT",
    name: "签约/解约回调",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: KS_EXPECTED,
    idGenerations: ksEnvelopeIdGenerations(),
    payload: GOLDEN_CONTRACT,
  }),
] as const;
