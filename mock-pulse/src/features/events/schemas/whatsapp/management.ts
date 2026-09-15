import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  WA_DEFINITIONS,
  WA_EXPECTED,
  waManagementEnvelope,
  waManagementIdGenerations,
} from "./shared";

/**
 * 管理面组件事件（whatsapp_business_management 权限组，事实库 §2.2 组件表）：
 * 模板状态与号码吞吐有官方核验样本（§5.4/§5.5 逐字，信封 entry 在前、object
 * 收尾且 entry[].time 为数字秒级）；capability/account 按组件表字段名构造
 * 代表（官方未给载荷样本，占位注明，订阅语义由 changes[].field 名承载）。
 */

/** 官方样本 §5.4 逐字：模板状态变更 APPROVED */
const GOLDEN_TEMPLATE_STATUS: WirePayload = waManagementEnvelope(
  "102290129340398",
  1751247548,
  {
    event: "APPROVED",
    message_template_id: 1689556908129832,
    message_template_name: "order_confirmation",
    message_template_language: "en-US",
    reason: "NONE",
    message_template_category: "UTILITY",
  },
  "message_template_status_update",
);

/** 官方样本 §5.5 逐字：号码吞吐等级变更 THROUGHPUT_UPGRADE */
const GOLDEN_PHONE_QUALITY: WirePayload = waManagementEnvelope(
  "102290129340398",
  1748454394,
  {
    display_phone_number: "15550783881",
    event: "THROUGHPUT_UPGRADE",
    current_limit: "TIER_UNLIMITED",
  },
  "phone_number_quality_update",
);

/**
 * capability 代表（官方未给载荷样本）：value 仅承载 messaging-limits 页
 * 实锤字段名 max_daily_conversations_per_business（v24.0+；旧口径
 * max_daily_conversation_per_phone 已于 2026-02 移除），值取 100K 阶梯占位。
 */
const CAPABILITY_UPDATE: WirePayload = waManagementEnvelope(
  "102290129340398",
  1748454394,
  { max_daily_conversations_per_business: 100000 },
  "business_capability_update",
);

/**
 * account 代表（官方未给载荷样本，全事件表待核验(09-27) §7-11）：value 空
 * 对象占位，订阅语义由 changes[].field 名承载（同支付宝网关先例）。
 */
const ACCOUNT_UPDATE: WirePayload = waManagementEnvelope(
  "102290129340398",
  1748454394,
  {},
  "account_update",
);

export const WA_MANAGEMENT_SCHEMAS = [
  defineSchema(WA_DEFINITIONS, "wa-template-status-update", {
    // 判型字段为 value.event（同手机质量事件取值口径）
    eventName: "APPROVED",
    name: "模板状态变更 APPROVED",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WA_EXPECTED,
    idGenerations: [
      ...waManagementIdGenerations(),
      {
        path: "entry[0].changes[0].value.message_template_id",
        kind: "waTemplateId",
      },
    ],
    payload: GOLDEN_TEMPLATE_STATUS,
  }),
  defineSchema(WA_DEFINITIONS, "wa-phone-quality-update", {
    eventName: "THROUGHPUT_UPGRADE",
    name: "号码吞吐等级变更 THROUGHPUT_UPGRADE",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WA_EXPECTED,
    idGenerations: [
      ...waManagementIdGenerations(),
      {
        path: "entry[0].changes[0].value.display_phone_number",
        kind: "waPhone",
      },
    ],
    payload: GOLDEN_PHONE_QUALITY,
  }),
  defineSchema(WA_DEFINITIONS, "wa-capability-update", {
    // 信封无 event 字段，判型取 changes[].field（订阅字段名承载语义）
    eventName: "business_capability_update",
    name: "商业组合能力变更（消息限额）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WA_EXPECTED,
    idGenerations: waManagementIdGenerations(),
    payload: CAPABILITY_UPDATE,
  }),
  defineSchema(WA_DEFINITIONS, "wa-account-update", {
    eventName: "account_update",
    name: "WABA 账户更新（载荷待核验）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WA_EXPECTED,
    idGenerations: waManagementIdGenerations(),
    payload: ACCOUNT_UPDATE,
  }),
] as const;
