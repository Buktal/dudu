import { describe, expect, it } from "vitest";

import { applyGeneratedIds, generateXhsMsgId } from "../ids";
import { XHS_DEFINITIONS, XHS_SCHEMAS } from "./xiaohongshu";

/** 官方客服消息样本骨架（事实库 §10.3 逐字：占位值与秒级时刻照录） */
const GOLDEN_MESSAGE_SKELETON = {
  MsgId: "MSG_ID",
  FromOpenId: "USER_OPEN_ID",
  ToAppId: "SELLER_APP_ID",
  CreateTime: 1648714429,
};

/** ark 官方构造示例逐字（事实库 §5.4，data 二级转义字符串照录） */
const GOLDEN_ARK_STATUS_CHANGE = {
  msgTag: "msg_fulfillment_status_change",
  sellerId: "5e8e****",
  data: '{"orderId":"P01****","updateTime":1693500000,"orderStatus":4}',
};
const GOLDEN_ARK_AFTER_SALE_CREATE = {
  msgTag: "msg_after_sale_create",
  sellerId: "5e8e****",
  data: '{"returnsId":"R01****","orderId":"P01****","returnType":1,"request_from":1,"refundFee":9900,"updateTime":1693500001}',
};

const schemaOf = (id: string) => {
  const found = XHS_SCHEMAS.find((schema) => schema.id === id);
  if (!found) throw new Error(`缺少模板：${id}`);
  return found;
};

describe("小红书事件 schema 聚合（双体系；握手/加密/数组直发在 Rust 适配器）", () => {
  it("客服消息 5 + 支付回调 2 + ark 10 = 17 模板，id 全仓库唯一且 xhs- 前缀", () => {
    expect(XHS_SCHEMAS).toHaveLength(17);
    const ids = XHS_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("xhs-"))).toBe(true);
  });

  it("描述文件分文件合并装载合法，且模板条目与协议模块一一对应", () => {
    expect(XHS_DEFINITIONS.channelId).toBe("xiaohongshu");
    expect(XHS_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(XHS_DEFINITIONS.schemas).sort()).toEqual(
      XHS_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("报文形态绑定：全部模板走 JSON（小程序加密信封语义 / ark 数组明文）", () => {
    for (const schema of XHS_SCHEMAS) {
      expect(schema.wire, `${schema.id} wire`).toBe("json");
      expect(schema.contentString, `${schema.id} contentString`).toBe(false);
    }
  });

  it("默认期望回执 = 渠道真实应答：小程序回 success（逐字）、ark 回 success/error_code JSON 字段", () => {
    for (const schema of XHS_SCHEMAS) {
      if (schema.id.startsWith("xhs-ark-")) {
        // 事实库 §2.1/§5.4：{"success":true,"error_code":0,"error_msg":""}——
        // error_msg 等额外字段允许存在，按 JSON 字段子集声明
        expect(schema.expected, `${schema.id} expected`).toEqual({
          status: 200,
          body: '{"success":true,"error_code":0}',
          bodyMode: "jsonField",
        });
      } else {
        // 事实库 §10.5：直接回复 success（不带引号），5s 超时×3 重试
        expect(schema.expected, `${schema.id} expected`).toEqual({
          status: 200,
          body: "success",
          bodyMode: "equals",
        });
      }
    }
  });

  it("客服消息五模板共用官方骨架（§10.3 键序：通用五字段在前、专属字段殿后）", () => {
    const SPECIFIC_FIELD: Record<string, string> = {
      text: "Content",
      image: "PicUrl",
      video: "VideoUrl",
      item: "OutProductId",
      order: "OutOrderId",
    };
    for (const id of [
      "xhs-text",
      "xhs-image",
      "xhs-video",
      "xhs-item",
      "xhs-order",
    ]) {
      const schema = schemaOf(id);
      expect(Object.keys(schema.payload), `${id} 键序`).toEqual([
        "MsgId",
        "FromOpenId",
        "ToAppId",
        "MsgType",
        "CreateTime",
        SPECIFIC_FIELD[schema.eventName],
      ]);
      expect(schema.payload.MsgId, `${id} MsgId`).toBe(
        GOLDEN_MESSAGE_SKELETON.MsgId,
      );
      expect(schema.payload.FromOpenId, `${id} FromOpenId`).toBe(
        GOLDEN_MESSAGE_SKELETON.FromOpenId,
      );
      expect(schema.payload.ToAppId, `${id} ToAppId`).toBe(
        GOLDEN_MESSAGE_SKELETON.ToAppId,
      );
      expect(schema.payload.CreateTime, `${id} CreateTime`).toBe(
        GOLDEN_MESSAGE_SKELETON.CreateTime,
      );
    }
  });

  it("text 模板官方样本逐字（§10.3：Content 官方占位 ... 照录），其余四 MsgType 专属字段名逐字", () => {
    expect(schemaOf("xhs-text").payload).toEqual({
      ...GOLDEN_MESSAGE_SKELETON,
      MsgType: "text",
      Content: "...",
    });
    expect(schemaOf("xhs-image").payload.PicUrl).toBe("PIC_URL");
    expect(schemaOf("xhs-video").payload.VideoUrl).toBe("VIDEO_URL");
    expect(schemaOf("xhs-item").payload.OutProductId).toBe("OUT_PRODUCT_ID");
    expect(schemaOf("xhs-order").payload.OutOrderId).toBe("OUT_ORDER_ID");
  });

  it("PAY_RESULT 主单/预约单按官方字段表逐字（§11.1：OrderType 判别、预约单 OutBookOrderId 替代）", () => {
    expect(schemaOf("xhs-pay-result").payload).toEqual({
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
    });
    expect(schemaOf("xhs-pay-result-book").payload).toEqual({
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
    });
    // 两模板共用 Event=PAY_RESULT（官方：同一 Event，OrderType 区分）
    expect(schemaOf("xhs-pay-result").payload.Event).toBe(
      schemaOf("xhs-pay-result-book").payload.Event,
    );
  });

  it("ark 官方构造示例两模板逐字（§5.4：信封字段名与 data 二级转义字符串照录）", () => {
    expect(schemaOf("xhs-ark-fulfillment-status-change").payload).toEqual(
      GOLDEN_ARK_STATUS_CHANGE,
    );
    expect(schemaOf("xhs-ark-after-sale-create").payload).toEqual(
      GOLDEN_ARK_AFTER_SALE_CREATE,
    );
  });

  it("ark 十模板共用官方信封键序（§2.1 逐字：msgTag/sellerId/data），data 均为 JSON 字符串", () => {
    for (const schema of XHS_SCHEMAS.filter((item) =>
      item.id.startsWith("xhs-ark-"),
    )) {
      expect(Object.keys(schema.payload), `${schema.id} 键序`).toEqual([
        "msgTag",
        "sellerId",
        "data",
      ]);
      expect(schema.eventName, `${schema.id} msgTag 同名`).toBe(
        schema.payload.msgTag,
      );
      // data 为内层业务 JSON 序列化字符串（二级转义）：能被二次反序列化
      expect(
        () => JSON.parse(schema.payload.data as string),
        schema.id,
      ).not.toThrow();
    }
  });

  it("ark 字段命名不统一按事实库保留原样（§2.2：request_from 下划线、openAddressId 两事件类型不同）", () => {
    // request_from 下划线（非驼峰）逐字保留
    expect(GOLDEN_ARK_AFTER_SALE_CREATE.data).toContain('"request_from":1');
    const dataOf = (id: string) =>
      JSON.parse(schemaOf(id).payload.data as string) as Record<
        string,
        unknown
      >;
    // receiver_change 的 openAddressId 为 string
    expect(
      typeof dataOf("xhs-ark-fulfillment-receiver-change").openAddressId,
    ).toBe("string");
    // deliver_time_change 的 openAddressId 为 int64 数字——类型差异保留
    expect(
      typeof dataOf("xhs-ark-fulfillment-deliver-time-change").openAddressId,
    ).toBe("number");
    // 售后族数值字段形态：returnType/request_from int64、refundFee float64
    const transfer = dataOf("xhs-ark-after-sale-transfer");
    expect(transfer.returnType).toBe(4);
    expect(transfer.request_from).toBe(1);
    expect(transfer.refundFee).toBe(9900);
  });

  it("ark 事件目录与官方 msgTag 清单逐字（事实库 §2.2 十事件）", () => {
    expect(
      XHS_SCHEMAS.filter((schema) => schema.id.startsWith("xhs-ark-")).map(
        (schema) => schema.eventName,
      ),
    ).toEqual([
      "msg_fulfillment_status_change",
      "msg_fulfillment_receiver_change",
      "msg_fulfillment_seller_remark_change",
      "msg_fulfillment_deliver_time_change",
      "msg_after_sale_create",
      "msg_after_sale_transfer",
      "msg_sku_create",
      "msg_sku_buyable",
      "msg_sku_delete",
      "msg_item_audit_reject",
    ]);
  });

  it("事件回调目录仅核验范围内条目入表（§10.7：只有 PAY_RESULT 有官方字段表正文）", () => {
    const eventNames = XHS_SCHEMAS.filter(
      (schema) => schema.kind === "event" && !schema.id.startsWith("xhs-ark-"),
    ).map((schema) => schema.eventName);
    expect(eventNames).toEqual(["PAY_RESULT", "PAY_RESULT"]);
  });

  it("ID 生成器官方形态：MsgId 为 18 位数字串、CreateTime/PayTime 为秒级时刻", () => {
    const msgId = generateXhsMsgId();
    expect(msgId).toMatch(/^[1-9]\d{17}$/);
    expect(generateXhsMsgId()).not.toBe(msgId);

    const message = schemaOf("xhs-text");
    const result = applyGeneratedIds(message, structuredClone(message.payload));
    expect(result.MsgId).toMatch(/^[1-9]\d{17}$/);
    expect(result.MsgId).not.toBe(message.payload.MsgId);
    expect(Number(result.CreateTime)).toBeGreaterThan(1648714429);

    // PAY_RESULT 只重生成 PayTime（订单/券码为掩码构造值，不参与生成）
    const payResult = schemaOf("xhs-pay-result");
    const payPayload = applyGeneratedIds(
      payResult,
      structuredClone(payResult.payload),
    );
    expect(payPayload.PayTime).not.toBe(payResult.payload.PayTime);
    expect(payPayload.OrderId).toBe("P01****");
  });

  it("ark 模板不设 ID 生成（updateTime 在 data 字符串内，掩码占位不重生成）", () => {
    for (const schema of XHS_SCHEMAS.filter((item) =>
      item.id.startsWith("xhs-ark-"),
    )) {
      expect(schema.idGenerations, `${schema.id} idGenerations`).toEqual([]);
      const result = applyGeneratedIds(schema, structuredClone(schema.payload));
      expect(result, `${schema.id} 载荷不变`).toEqual(schema.payload);
    }
  });

  it("事件目录：客服 5 MsgType（message）+ 支付/ark 12 事件（event）", () => {
    expect(XHS_SCHEMAS.map((schema) => schema.kind)).toEqual([
      "message",
      "message",
      "message",
      "message",
      "message",
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
      "event",
      "event",
    ]);
  });
});
