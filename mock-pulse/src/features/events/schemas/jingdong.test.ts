import { describe, expect, it } from "vitest";

import { applyGeneratedIds } from "../ids";
import { parseWireDraft, wireBodyText } from "../payload";
import { JD_DEFINITIONS, JD_SCHEMAS } from "./jingdong";

/** 官方实锤样本/枚举的公共值（事实库 jingdong.md §2.1/§2.4/§5.3 逐字） */
const GOLDEN_ORDER_STATES = [
  "WAIT_SELLER_STOCK_OUT",
  "WAIT_GOODS_RECEIVE_CONFIRM",
  "WAIT_SELLER_DELIVERY",
  "PAUSE",
  "FINISHED_L",
  "TRADE_CANCELED",
  "LOCKED",
  "POP_ORDER_PAUSE",
  "NOT_PAY",
];

describe("京东事件 schema 聚合（JOS 消息推送；MD5 签名在 Rust 适配器）", () => {
  it("订单 9 + 售后 1 + 咚咚 2 = 12 模板，id 全仓库唯一且 jd- 前缀", () => {
    expect(JD_SCHEMAS).toHaveLength(12);
    const ids = JD_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("jd-"))).toBe(true);
  });

  it("描述文件分文件合并装载合法，且模板条目与协议模块一一对应", () => {
    expect(JD_DEFINITIONS.channelId).toBe("jingdong");
    expect(JD_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(JD_DEFINITIONS.schemas).sort()).toEqual(
      JD_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("报文形态绑定：全部模板走 JSON 明文（推送通道投递形态待核验，无 XML 无 AES）", () => {
    for (const schema of JD_SCHEMAS) {
      expect(schema.wire, `${schema.id} wire`).toBe("json");
      expect(schema.contentString, `${schema.id} contentString`).toBe(false);
    }
  });

  it("每个字段都有标题/类型/分组/解释", () => {
    for (const schema of JD_SCHEMAS) {
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
    for (const schema of JD_SCHEMAS) {
      // 事实库 §3.1/§5.5：推送应答与回调签收无官方原文（待核验 09-27）——
      // 期望回执取最中性签收语义，复核 listId=520 后收口
      expect(schema.expected, `${schema.id} expected`).toEqual({
        status: 200,
        body: "",
        bodyMode: "contains",
      });
    }
  });

  it("模板载荷逐字节自反：线上 JSON ↔ 载荷解析往返一致", () => {
    for (const schema of JD_SCHEMAS) {
      const text = wireBodyText(schema, schema.payload);
      const parsed = parseWireDraft(schema, text);
      expect(parsed, `${schema.id} 往返载荷`).toEqual(schema.payload);
      expect(wireBodyText(schema, parsed), `${schema.id} 往返明文`).toBe(text);
    }
  });

  it("订单 9 状态推送：eventName 全目录穷尽官方 9 枚举（§2.1 逐字），骨架只收实锤两字段", () => {
    const orderSchemas = JD_SCHEMAS.filter((schema) =>
      schema.id.startsWith("jd-order-"),
    );
    expect(orderSchemas).toHaveLength(9);
    expect(orderSchemas.map((schema) => schema.eventName)).toEqual(
      GOLDEN_ORDER_STATES,
    );
    for (const schema of orderSchemas) {
      // 订单消息类型名与载荷待核验(09-27)：骨架仅收官方词汇 order_id/order_state
      expect(Object.keys(schema.payload)).toEqual(["order_id", "order_state"]);
      expect(schema.payload.order_state).toBe(schema.eventName);
    }
  });

  it("AFS_StepResult_JOS 消息名实锤逐字，载荷骨架从简仅 serviceId 并注明待核验", () => {
    const schema = JD_SCHEMAS.find((item) => item.id === "jd-afs-step-result");
    expect(schema?.eventName).toBe("AFS_StepResult_JOS");
    expect(Object.keys(schema?.payload ?? {})).toEqual(["serviceId"]);
    const serviceIdField = schema?.fields.find(
      (field) => field.path === "serviceId",
    );
    expect(serviceIdField?.description).toContain("待核验(09-27)");
  });

  it("咚咚 chat_message4.2：协议体唯一官方 voice 片段逐字（值含前置空格原文）", () => {
    const schema = JD_SCHEMAS.find((item) => item.id === "jd-dd-chat-message");
    expect(schema?.eventName).toBe("chat_message4.2");
    expect(schema?.kind).toBe("message");
    expect(schema?.payload).toEqual({
      type: " voice",
      url: " 上传京东云文件地址url（字符型，必须。声音文件京东CDN下载地址）",
    });
  });

  it("咚咚 push2：应用级参数表五参数逐字（operatePin 样本值 testPin 即官方原文）", () => {
    const schema = JD_SCHEMAS.find((item) => item.id === "jd-dd-push2");
    expect(schema?.eventName).toBe(
      "jingdong.dongdong.packet.josChatMessage.push2",
    );
    expect(Object.keys(schema?.payload ?? {})).toEqual([
      "buId",
      "operatePin",
      "operateNick",
      "serviceId",
      "orderId",
    ]);
    expect(schema?.payload).toEqual({
      buId: "123456",
      operatePin: "testPin",
      operateNick: "测试客服",
      serviceId: "1001",
      orderId: "123456789",
    });
  });

  it("事件目录：订单 9 event + 售后 1 event + 咚咚 2 message", () => {
    expect(JD_SCHEMAS.map((schema) => schema.id)).toEqual([
      "jd-order-wait-seller-stock-out",
      "jd-order-wait-goods-receive-confirm",
      "jd-order-wait-seller-delivery",
      "jd-order-pause",
      "jd-order-finished-l",
      "jd-order-trade-canceled",
      "jd-order-locked",
      "jd-order-pop-order-pause",
      "jd-order-not-pay",
      "jd-afs-step-result",
      "jd-dd-chat-message",
      "jd-dd-push2",
    ]);
    expect(JD_SCHEMAS.map((schema) => schema.kind)).toEqual([
      "event",
      "event",
      "event",
      "event",
      "event",
      "event",
      "event",
      "event",
      "event",
      "event",
      "message",
      "message",
    ]);
  });

  it("ID 生成器官方形态：订单号/服务单号数字串（9~15 位首位非零），chat_message 静态不重生", () => {
    const order = JD_SCHEMAS.find(
      (item) => item.id === "jd-order-wait-seller-stock-out",
    );
    expect(order).toBeDefined();
    if (!order) return;
    const orderDraft = applyGeneratedIds(order, structuredClone(order.payload));
    expect(String(orderDraft.order_id)).toMatch(/^[1-9]\d{8,14}$/);
    expect(orderDraft.order_id).not.toBe(order.payload.order_id);
    expect(orderDraft.order_state).toBe(order.payload.order_state);

    const push2 = JD_SCHEMAS.find((item) => item.id === "jd-dd-push2");
    expect(push2).toBeDefined();
    if (!push2) return;
    const push2Draft = applyGeneratedIds(push2, structuredClone(push2.payload));
    expect(String(push2Draft.orderId)).toMatch(/^[1-9]\d{8,14}$/);
    expect(String(push2Draft.serviceId)).toMatch(/^[1-9]\d{8,14}$/);
    expect(push2Draft.orderId).not.toBe(push2.payload.orderId);
    // 官方样本词汇不重生：operatePin 恒 testPin
    expect(push2Draft.operatePin).toBe("testPin");

    const chat = JD_SCHEMAS.find((item) => item.id === "jd-dd-chat-message");
    expect(chat).toBeDefined();
    if (!chat) return;
    const chatDraft = applyGeneratedIds(chat, structuredClone(chat.payload));
    expect(chatDraft).toEqual(chat.payload);
  });
});
