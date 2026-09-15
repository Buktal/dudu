import { describe, expect, it } from "vitest";

import { applyGeneratedIds } from "../ids";
import { parseWireDraft, wireBodyText } from "../payload";
import { PDD_DEFINITIONS, PDD_SCHEMAS } from "./pinduoduo";

/** 官方照录状态词汇（事实库 pinduoduo.md §2.1 逐字） */
const GOLDEN_STATES = ["1-待发货", "2-已发货代签收", "3-已签收"];

describe("拼多多事件 schema 聚合（PMC 订阅推送；UPPER(MD5) 签名在 Rust 适配器）", () => {
  it("订单三态 = 3 模板，id 全仓库唯一且 pdd- 前缀", () => {
    expect(PDD_SCHEMAS).toHaveLength(3);
    const ids = PDD_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("pdd-"))).toBe(true);
  });

  it("描述文件装载合法，且模板条目与协议模块一一对应", () => {
    expect(PDD_DEFINITIONS.channelId).toBe("pinduoduo");
    expect(PDD_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(PDD_DEFINITIONS.schemas).sort()).toEqual(
      PDD_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("报文形态绑定：全部模板走 JSON 明文（推送传输形态待核验，无 XML 无 AES）", () => {
    for (const schema of PDD_SCHEMAS) {
      expect(schema.wire, `${schema.id} wire`).toBe("json");
      expect(schema.contentString, `${schema.id} contentString`).toBe(false);
    }
  });

  it("每个字段都有标题/类型/分组/解释", () => {
    for (const schema of PDD_SCHEMAS) {
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

  it("默认期望回执 = 渠道真实应答：推送应答口径待核验，取最中性 HTTP 200 + 不校验正文", () => {
    for (const schema of PDD_SCHEMAS) {
      // 事实库 §3：推送应答与签收无官方原文（待核验 09-27）——期望回执取
      // 最中性签收语义，复核后收口
      expect(schema.expected, `${schema.id} expected`).toEqual({
        status: 200,
        body: "",
        bodyMode: "contains",
      });
    }
  });

  it("模板载荷逐字对齐事实库：order_status number 形态（§5.1 官方 body 逐字）+ 线上明文逐字节", () => {
    const expectedBodies = [
      '{"order_id":"123456789","order_status":1}',
      '{"order_id":"123456789","order_status":2}',
      '{"order_id":"123456789","order_status":3}',
    ];
    expect(
      PDD_SCHEMAS.map((schema) => wireBodyText(schema, schema.payload)),
    ).toEqual(expectedBodies);
  });

  it("模板载荷逐字节自反：线上 JSON ↔ 载荷解析往返一致", () => {
    for (const schema of PDD_SCHEMAS) {
      const text = wireBodyText(schema, schema.payload);
      const parsed = parseWireDraft(schema, text);
      expect(parsed, `${schema.id} 往返载荷`).toEqual(schema.payload);
      expect(wireBodyText(schema, parsed), `${schema.id} 往返明文`).toBe(text);
    }
  });

  it("订单三态推送：eventName 全目录穷尽官方照录状态词汇（§2.1 逐字），骨架只收实锤两字段", () => {
    const orderSchemas = PDD_SCHEMAS.filter((schema) =>
      schema.id.startsWith("pdd-order-"),
    );
    expect(orderSchemas).toHaveLength(3);
    expect(orderSchemas.map((schema) => schema.eventName)).toEqual(
      GOLDEN_STATES,
    );
    for (const schema of orderSchemas) {
      // 推送 topic 与载荷正文待核验(09-27)：骨架仅收 order_id/order_status
      expect(Object.keys(schema.payload)).toEqual(["order_id", "order_status"]);
      expect(schema.kind).toBe("event");
    }
  });

  it("order_status 字段描述锚定官方照录（1-待发货/2-已发货代签收/3-已签收）", () => {
    const descriptions = PDD_SCHEMAS.map(
      (schema) =>
        schema.fields.find((field) => field.path === "order_status")
          ?.description ?? "",
    );
    expect(descriptions[0]).toContain("1-待发货");
    expect(descriptions[1]).toContain("2-已发货代签收");
    expect(descriptions[2]).toContain("3-已签收");
  });

  it("order_id 字段描述注明通名暂代与待核验（官方字段名未摘到，不编造）", () => {
    for (const schema of PDD_SCHEMAS) {
      const field = schema.fields.find((item) => item.path === "order_id");
      expect(field?.description).toContain("order_id 为通名暂代");
      expect(field?.description).toContain("待核验(09-27)");
    }
  });

  it("ID 生成器官方形态：订单号数字串（9~15 位首位非零），order_status 不重生", () => {
    const schema = PDD_SCHEMAS.find(
      (item) => item.id === "pdd-order-wait-delivery",
    );
    expect(schema).toBeDefined();
    if (!schema) return;
    const draft = applyGeneratedIds(schema, structuredClone(schema.payload));
    expect(String(draft.order_id)).toMatch(/^[1-9]\d{8,14}$/);
    expect(draft.order_id).not.toBe(schema.payload.order_id);
    // 官方实锤状态值不重生
    expect(draft.order_status).toBe(schema.payload.order_status);
  });
});
