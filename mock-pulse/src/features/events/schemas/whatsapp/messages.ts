import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  WA_DEFINITIONS,
  WA_EXPECTED,
  waEnvelopeIdGenerations,
  waMessagesEnvelope,
  waStatusIdGenerations,
} from "./shared";

/**
 * messages/statuses 推送（事实库 §5.1/§5.2/§2.1/§3.3）：含 messages[] 数组
 * 即用户 inbound 消息、含 statuses[] 数组即商家 outbound 状态（判型规则）。
 * 入站文本为官方核验样本逐字（§5.1）；statuses delivered 逐字（§5.2），
 * sent/read/failed 按 §2.1 状态枚举与错误挂载口径构造（官方全量样本未给，
 * 占位取事实库同源实锤值并注明）。判型字段为 messages[].type / statuses[].status。
 */

/** 官方样本 §5.1 逐字：入站文本消息（contacts + messages 二选结构） */
const GOLDEN_INBOUND_TEXT: WirePayload = waMessagesEnvelope("102290129340398", {
  messaging_product: "whatsapp",
  metadata: {
    display_phone_number: "15550783881",
    phone_number_id: "106540352242922",
  },
  contacts: [{ profile: { name: "Sheena Nelson" }, wa_id: "16505551234" }],
  messages: [
    {
      from: "16505551234",
      id: "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=",
      timestamp: "1749416383",
      type: "text",
      text: { body: "Does it come in another color?" },
    },
  ],
});

/** 官方样本 §5.2 逐字：delivered 状态（conversation + pricing） */
const GOLDEN_STATUS_DELIVERED: WirePayload = waMessagesEnvelope(
  "102290129340398",
  {
    messaging_product: "whatsapp",
    metadata: {
      display_phone_number: "15550783881",
      phone_number_id: "106540352242922",
    },
    statuses: [
      {
        id: "wamid.HBgLMTY1MDM4Nzk0MzkVAgARGBI3MTE5MjVBOTE3MDk5QUVFM0YA",
        status: "delivered",
        timestamp: "1750263773",
        recipient_id: "16505551234",
        conversation: {
          id: "6ceb9d929c9bdc4f90e967a32f8639b4",
          origin: { type: "service" },
        },
        pricing: {
          billable: true,
          pricing_model: "CBP",
          category: "service",
        },
      },
    ],
  },
);

/**
 * sent 状态代表（§5.2 注明的官方 sent 例形态：marketing 类 / pricing_model
 * PMP / 含 expiration_timestamp；wamid 取 §5.3 发送响应样本逐字，其余占位
 * 取事实库同源实锤值并注明）。
 */
const STATUS_SENT: WirePayload = waMessagesEnvelope("102290129340398", {
  messaging_product: "whatsapp",
  metadata: {
    display_phone_number: "15550783881",
    phone_number_id: "106540352242922",
  },
  statuses: [
    {
      id: "wamid.HBgLMTY0NjcwNDM1OTUVAgARGBI1RjQyNUE3NEYxMzAzMzQ5MkEA",
      status: "sent",
      timestamp: "1749416383",
      recipient_id: "16505551234",
      conversation: {
        id: "6ceb9d929c9bdc4f90e967a32f8639b4",
        origin: { type: "marketing" },
      },
      pricing: {
        billable: true,
        pricing_model: "PMP",
        category: "marketing",
      },
      expiration_timestamp: "1750263773",
    },
  ],
});

/**
 * read 状态代表（§2.1 枚举 read = 两蓝勾；conversation/pricing 按 v24.0+
 * 「只出现在 sent 与 delivered/read 其中之一」口径不落 read）。
 */
const STATUS_READ: WirePayload = waMessagesEnvelope("102290129340398", {
  messaging_product: "whatsapp",
  metadata: {
    display_phone_number: "15550783881",
    phone_number_id: "106540352242922",
  },
  statuses: [
    {
      id: "wamid.HBgLMTY0NjcwNDM1OTUVAgARGBI1RjQyNUE3NEYxMzAzMzQ5MkEA",
      status: "read",
      timestamp: "1749416383",
      recipient_id: "16505551234",
    },
  ],
});

/**
 * failed 状态代表（§2.1 枚举 failed + outbound 错误挂载在 statuses[].errors；
 * 错误码取事实库 §3.3 实锤的 131035——No Storage 号重试窗超限改发的错误
 * webhook，完整错误对象形态待核验(09-27)）。
 */
const STATUS_FAILED: WirePayload = waMessagesEnvelope("102290129340398", {
  messaging_product: "whatsapp",
  metadata: {
    display_phone_number: "15550783881",
    phone_number_id: "106540352242922",
  },
  statuses: [
    {
      id: "wamid.HBgLMTY0NjcwNDM1OTUVAgARGBI1RjQyNUE3NEYxMzAzMzQ5MkEA",
      status: "failed",
      timestamp: "1749416383",
      recipient_id: "16505551234",
      errors: [{ code: 131035 }],
    },
  ],
});

export const WA_MESSAGES_SCHEMAS = [
  defineSchema(WA_DEFINITIONS, "wa-inbound-text", {
    // 判型字段为 messages[].type（同淘宝 data.order_status 取值口径）
    eventName: "text",
    name: "入站文本消息（contacts + messages）",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: WA_EXPECTED,
    idGenerations: [
      ...waEnvelopeIdGenerations(),
      {
        path: "entry[0].changes[0].value.contacts[0].wa_id",
        kind: "waPhone",
      },
      {
        path: "entry[0].changes[0].value.messages[0].from",
        kind: "waPhone",
        // 发件人与用户 WhatsApp ID 同值（§5.1 样本两处同为 16505551234）
        sameAs: "entry[0].changes[0].value.contacts[0].wa_id",
      },
      {
        path: "entry[0].changes[0].value.messages[0].id",
        kind: "waWamid",
      },
      {
        path: "entry[0].changes[0].value.messages[0].timestamp",
        kind: "createTimeSec",
      },
    ],
    payload: GOLDEN_INBOUND_TEXT,
  }),
  defineSchema(WA_DEFINITIONS, "wa-status-delivered", {
    eventName: "delivered",
    name: "出站状态 delivered（已送达·两勾）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WA_EXPECTED,
    idGenerations: [
      ...waEnvelopeIdGenerations(),
      ...waStatusIdGenerations(),
      {
        path: "entry[0].changes[0].value.statuses[0].conversation.id",
        kind: "waConversationId",
      },
    ],
    payload: GOLDEN_STATUS_DELIVERED,
  }),
  defineSchema(WA_DEFINITIONS, "wa-status-sent", {
    eventName: "sent",
    name: "出站状态 sent（已发出·一勾）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WA_EXPECTED,
    idGenerations: [
      ...waEnvelopeIdGenerations(),
      ...waStatusIdGenerations(),
      {
        path: "entry[0].changes[0].value.statuses[0].conversation.id",
        kind: "waConversationId",
      },
      {
        path: "entry[0].changes[0].value.statuses[0].expiration_timestamp",
        kind: "createTimeSec",
      },
    ],
    payload: STATUS_SENT,
  }),
  defineSchema(WA_DEFINITIONS, "wa-status-read", {
    eventName: "read",
    name: "出站状态 read（已读·两蓝勾）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WA_EXPECTED,
    idGenerations: [...waEnvelopeIdGenerations(), ...waStatusIdGenerations()],
    payload: STATUS_READ,
  }),
  defineSchema(WA_DEFINITIONS, "wa-status-failed", {
    eventName: "failed",
    name: "出站状态 failed（发送失败）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WA_EXPECTED,
    idGenerations: [...waEnvelopeIdGenerations(), ...waStatusIdGenerations()],
    payload: STATUS_FAILED,
  }),
] as const;
