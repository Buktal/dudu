import { describe, expect, it } from "vitest";

import { applyGeneratedIds } from "../ids";
import { parseWireDraft, wireBodyText } from "../payload";
import { WA_DEFINITIONS, WA_SCHEMAS } from "./whatsapp";

/** 官方验证样本的公共值（事实库 whatsapp.md §5.1/§5.2/§5.3/§5.4/§5.5 逐字） */
const GOLDEN_WABA_ID = "102290129340398";
const GOLDEN_DISPLAY_PHONE = "15550783881";
const GOLDEN_PHONE_NUMBER_ID = "106540352242922";
const GOLDEN_WA_ID = "16505551234";
const GOLDEN_INBOUND_WAMID =
  "wamid.HBgLMTY1MDM4Nzk0MzkVAgASGBQzQTRBNjU5OUFFRTAzODEwMTQ0RgA=";
const GOLDEN_SEND_WAMID =
  "wamid.HBgLMTY0NjcwNDM1OTUVAgARGBI1RjQyNUE3NEYxMzAzMzQ5MkEA";
const GOLDEN_DELIVERED_WAMID =
  "wamid.HBgLMTY1MDM4Nzk0MzkVAgARGBI3MTE5MjVBOTE3MDk5QUVFM0YA";
const GOLDEN_CONVERSATION_ID = "6ceb9d929c9bdc4f90e967a32f8639b4";

const statusOf = (schemaId: string) => {
  const schema = WA_SCHEMAS.find((item) => item.id === schemaId);
  expect(schema, schemaId).toBeDefined();
  if (!schema) throw new Error(schemaId);
  return schema;
};

describe("WhatsApp 事件 schema 聚合（Cloud API Webhook；验签与 GET 握手在 Rust 适配器）", () => {
  it("入站文本 1 + 出站状态 4 + 管理面 4 = 9 模板，id 全仓库唯一且 wa- 前缀", () => {
    expect(WA_SCHEMAS).toHaveLength(9);
    const ids = WA_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("wa-"))).toBe(true);
  });

  it("描述文件分文件合并装载合法，且模板条目与协议模块一一对应", () => {
    expect(WA_DEFINITIONS.channelId).toBe("whatsapp");
    expect(WA_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(WA_DEFINITIONS.schemas).sort()).toEqual(
      WA_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("报文形态绑定：全部模板走 JSON 明文（载荷不设加密字段，仅 HTTPS + 签名）", () => {
    for (const schema of WA_SCHEMAS) {
      expect(schema.wire, `${schema.id} wire`).toBe("json");
      expect(schema.contentString, `${schema.id} contentString`).toBe(false);
    }
  });

  it("每个字段都有标题/类型/分组/解释", () => {
    for (const schema of WA_SCHEMAS) {
      for (const field of schema.fields) {
        expect(field.title, `${schema.id}.${field.path} title`).toBeTruthy();
        expect(field.type, `${schema.id}.${field.path} type`).toBeTruthy();
        expect(field.group, `${schema.id}.${field.path} group`).toBeTruthy();
        expect(
          field.description,
          `${schema.id}.${field.path} description`,
        ).toBeTruthy();
      }
    }
  });

  it("默认期望回执 = 渠道真实应答：HTTP 200 即成功（正文无口径；非 200 或不可达递减重试最长 7 天）", () => {
    for (const schema of WA_SCHEMAS) {
      // 事实库 §3.3 逐字：「端点回 HTTP 200 即成功；其他状态码或不可达即失败，
      // Meta 以递减频率重试直到成功，最长 7 天」——空串 = 只看状态码
      expect(schema.expected, `${schema.id} expected`).toEqual({
        status: 200,
        body: "",
        bodyMode: "contains",
      });
    }
  });

  it("模板载荷逐字节自反：线上 JSON ↔ 载荷解析往返一致", () => {
    for (const schema of WA_SCHEMAS) {
      const text = wireBodyText(schema, schema.payload);
      const parsed = parseWireDraft(schema, text);
      expect(parsed, `${schema.id} 往返载荷`).toEqual(schema.payload);
      expect(wireBodyText(schema, parsed), `${schema.id} 往返明文`).toBe(text);
    }
  });

  it("入站文本载荷逐字（§5.1 官方样本键序与值：object→entry→changes→value→contacts/messages）", () => {
    const schema = statusOf("wa-inbound-text");
    expect(schema.kind).toBe("message");
    expect(Object.keys(schema.payload)).toEqual(["object", "entry"]);
    expect(schema.payload.object).toBe("whatsapp_business_account");
    const entry = (schema.payload.entry as Array<Record<string, unknown>>)[0];
    expect(entry.id).toBe(GOLDEN_WABA_ID);
    // 信封键序：id → changes；value 键序：messaging_product → metadata → contacts → messages
    expect(Object.keys(entry)).toEqual(["id", "changes"]);
    const change = (entry.changes as Array<Record<string, unknown>>)[0];
    expect(Object.keys(change)).toEqual(["value", "field"]);
    expect(change.field).toBe("messages");
    expect(Object.keys(change.value as Record<string, unknown>)).toEqual([
      "messaging_product",
      "metadata",
      "contacts",
      "messages",
    ]);
    expect(change.value).toEqual({
      messaging_product: "whatsapp",
      metadata: {
        display_phone_number: GOLDEN_DISPLAY_PHONE,
        phone_number_id: GOLDEN_PHONE_NUMBER_ID,
      },
      contacts: [{ profile: { name: "Sheena Nelson" }, wa_id: GOLDEN_WA_ID }],
      messages: [
        {
          from: GOLDEN_WA_ID,
          id: GOLDEN_INBOUND_WAMID,
          timestamp: "1749416383",
          type: "text",
          text: { body: "Does it come in another color?" },
        },
      ],
    });
  });

  it("delivered 状态载荷逐字（§5.2 官方样本键序与值：statuses + conversation + pricing）", () => {
    const schema = statusOf("wa-status-delivered");
    expect(schema.kind).toBe("event");
    const change = (
      (schema.payload.entry as Array<Record<string, unknown>>)[0]
        .changes as Array<Record<string, unknown>>
    )[0];
    expect(change.field).toBe("messages");
    expect(change.value).toEqual({
      messaging_product: "whatsapp",
      metadata: {
        display_phone_number: GOLDEN_DISPLAY_PHONE,
        phone_number_id: GOLDEN_PHONE_NUMBER_ID,
      },
      statuses: [
        {
          id: GOLDEN_DELIVERED_WAMID,
          status: "delivered",
          timestamp: "1750263773",
          recipient_id: GOLDEN_WA_ID,
          conversation: {
            id: GOLDEN_CONVERSATION_ID,
            origin: { type: "service" },
          },
          pricing: {
            billable: true,
            pricing_model: "CBP",
            category: "service",
          },
        },
      ],
    });
  });

  it("sent/read/failed 状态代表按 §2.1 枚举构造：sent 落 conversation/pricing（marketing/PMP）与 expiration_timestamp，read/failed 不落", () => {
    const sent = statusOf("wa-status-sent");
    const sentValue = (
      (sent.payload.entry as Array<Record<string, unknown>>)[0]
        .changes as Array<Record<string, unknown>>
    )[0].value as Record<string, unknown>;
    const sentStatus = (
      sentValue.statuses as Array<Record<string, unknown>>
    )[0];
    expect(sentStatus.status).toBe("sent");
    expect(sentStatus.id).toBe(GOLDEN_SEND_WAMID);
    expect(sentStatus.conversation).toEqual({
      id: GOLDEN_CONVERSATION_ID,
      origin: { type: "marketing" },
    });
    expect(sentStatus.pricing).toEqual({
      billable: true,
      pricing_model: "PMP",
      category: "marketing",
    });
    expect(sentStatus.expiration_timestamp).toBe("1750263773");

    const read = statusOf("wa-status-read");
    const readStatus = (
      (
        (read.payload.entry as Array<Record<string, unknown>>)[0]
          .changes as Array<Record<string, unknown>>
      )[0].value as Record<string, unknown>
    ).statuses as Array<Record<string, unknown>>;
    expect(readStatus[0]).toEqual({
      id: GOLDEN_SEND_WAMID,
      status: "read",
      timestamp: "1749416383",
      recipient_id: GOLDEN_WA_ID,
    });

    const failed = statusOf("wa-status-failed");
    const failedStatus = (
      (
        (failed.payload.entry as Array<Record<string, unknown>>)[0]
          .changes as Array<Record<string, unknown>>
      )[0].value as Record<string, unknown>
    ).statuses as Array<Record<string, unknown>>;
    // outbound 错误挂载在 statuses[].errors（§2.1），错误码取事实库实锤 131035
    expect(failedStatus[0]).toEqual({
      id: GOLDEN_SEND_WAMID,
      status: "failed",
      timestamp: "1749416383",
      recipient_id: GOLDEN_WA_ID,
      errors: [{ code: 131035 }],
    });
  });

  it("管理面事件逐字与代表构造（§5.4/§5.5 键序 entry 在前 object 收尾、time 数字秒级）", () => {
    const template = statusOf("wa-template-status-update");
    // §5.4 官方键序：entry 在前、object 收尾（与 messages 族相反）
    expect(Object.keys(template.payload)).toEqual(["entry", "object"]);
    const templateChange = (
      (template.payload.entry as Array<Record<string, unknown>>)[0]
        .changes as Array<Record<string, unknown>>
    )[0];
    expect(templateChange.field).toBe("message_template_status_update");
    expect(templateChange.value).toEqual({
      event: "APPROVED",
      message_template_id: 1689556908129832,
      message_template_name: "order_confirmation",
      message_template_language: "en-US",
      reason: "NONE",
      message_template_category: "UTILITY",
    });
    expect(
      (template.payload.entry as Array<Record<string, unknown>>)[0].time,
    ).toBe(1751247548);

    const phone = statusOf("wa-phone-quality-update");
    expect(phone.eventName).toBe("THROUGHPUT_UPGRADE");
    const phoneChange = (
      (phone.payload.entry as Array<Record<string, unknown>>)[0]
        .changes as Array<Record<string, unknown>>
    )[0];
    expect(phoneChange.field).toBe("phone_number_quality_update");
    expect(phoneChange.value).toEqual({
      display_phone_number: GOLDEN_DISPLAY_PHONE,
      event: "THROUGHPUT_UPGRADE",
      current_limit: "TIER_UNLIMITED",
    });

    const capability = statusOf("wa-capability-update");
    const capabilityChange = (
      (capability.payload.entry as Array<Record<string, unknown>>)[0]
        .changes as Array<Record<string, unknown>>
    )[0];
    expect(capabilityChange.field).toBe("business_capability_update");
    // 官方未给载荷样本：仅组件表/messaging-limits 页实锤字段名 + 100K 阶梯占位
    expect(capabilityChange.value).toEqual({
      max_daily_conversations_per_business: 100000,
    });

    const account = statusOf("wa-account-update");
    const accountChange = (
      (account.payload.entry as Array<Record<string, unknown>>)[0]
        .changes as Array<Record<string, unknown>>
    )[0];
    expect(accountChange.field).toBe("account_update");
    // 全事件表待核验(09-27)：空对象占位，订阅语义由 field 名承载
    expect(accountChange.value).toEqual({});
  });

  it("事件目录：入站 1 message + 出站状态 4 event + 管理面 4 event", () => {
    expect(WA_SCHEMAS.map((schema) => schema.id)).toEqual([
      "wa-inbound-text",
      "wa-status-delivered",
      "wa-status-sent",
      "wa-status-read",
      "wa-status-failed",
      "wa-template-status-update",
      "wa-phone-quality-update",
      "wa-capability-update",
      "wa-account-update",
    ]);
    expect(WA_SCHEMAS.map((schema) => schema.kind)).toEqual([
      "message",
      "event",
      "event",
      "event",
      "event",
      "event",
      "event",
      "event",
      "event",
    ]);
  });

  it("ID 生成器官方形态：wamid 三处同源重生成、电话/账户纯数字串、会话 32 位 hex、管理面 time 数字秒级", () => {
    const inbound = statusOf("wa-inbound-text");
    const inboundDraft = applyGeneratedIds(
      inbound,
      structuredClone(inbound.payload),
    );
    const entryOf = (draft: Record<string, unknown>) =>
      (draft.entry as Array<Record<string, unknown>>)[0];
    const inboundValue = (
      entryOf(inboundDraft).changes as Array<Record<string, unknown>>
    )[0].value as Record<string, unknown>;
    const inboundMessage = (
      inboundValue.messages as Array<Record<string, unknown>>
    )[0];
    // wamid.HBgL + base64 风格串（可带尾部 =），与官方样本同形态且不重放
    expect(inboundMessage.id).toMatch(
      /^wamid\.HBgL[A-Za-z0-9+/]{48,51}={0,2}$/,
    );
    expect(inboundMessage.id).not.toBe(GOLDEN_INBOUND_WAMID);
    // 发件人跟随用户 WhatsApp ID（§5.1 样本两处同值）
    expect(inboundMessage.from).toBe(
      (
        (inboundValue.contacts as Array<Record<string, unknown>>)[0] as Record<
          string,
          unknown
        >
      ).wa_id,
    );
    expect(inboundMessage.timestamp).toMatch(/^\d{10}$/);
    expect(
      (inboundValue.metadata as Record<string, unknown>).display_phone_number,
    ).toMatch(/^1\d{10}$/);
    expect(
      (inboundValue.metadata as Record<string, unknown>).phone_number_id,
    ).toMatch(/^1\d{14}$/);
    expect(entryOf(inboundDraft).id).toMatch(/^1\d{14}$/);

    const delivered = statusOf("wa-status-delivered");
    const deliveredDraft = applyGeneratedIds(
      delivered,
      structuredClone(delivered.payload),
    );
    const deliveredValue = (
      entryOf(deliveredDraft).changes as Array<Record<string, unknown>>
    )[0].value as Record<string, unknown>;
    const deliveredStatus = (
      deliveredValue.statuses as Array<Record<string, unknown>>
    )[0];
    expect(deliveredStatus.id).toMatch(
      /^wamid\.HBgL[A-Za-z0-9+/]{48,51}={0,2}$/,
    );
    expect(deliveredStatus.recipient_id).toMatch(/^1\d{10}$/);
    expect(
      (deliveredStatus.conversation as Record<string, unknown>).id,
    ).toMatch(/^[0-9a-f]{32}$/);
    expect(deliveredStatus.timestamp).toMatch(/^\d{10}$/);

    const sent = statusOf("wa-status-sent");
    const sentDraft = applyGeneratedIds(sent, structuredClone(sent.payload));
    const sentStatus = (
      (
        (entryOf(sentDraft).changes as Array<Record<string, unknown>>)[0]
          .value as Record<string, unknown>
      ).statuses as Array<Record<string, unknown>>
    )[0];
    expect(sentStatus.expiration_timestamp).toMatch(/^\d{10}$/);

    const template = statusOf("wa-template-status-update");
    const templateDraft = applyGeneratedIds(
      template,
      structuredClone(template.payload),
    );
    const templateEntry = entryOf(templateDraft);
    expect(String(templateEntry.time)).toMatch(/^\d{10}$/);
    expect(typeof templateEntry.time).toBe("number");
    const templateValue = (
      templateEntry.changes as Array<Record<string, unknown>>
    )[0].value as Record<string, unknown>;
    // 模板 ID 保持 JSON number 形态（官方样本 1689556908129832 同形态）
    expect(typeof templateValue.message_template_id).toBe("number");
    expect(String(templateValue.message_template_id)).toMatch(/^\d{16}$/);
    expect(templateValue.message_template_id).not.toBe(1689556908129832);
  });
});
