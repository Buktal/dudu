import { describe, expect, it } from "vitest";

import { applyGeneratedIds } from "../ids";
import { wireBodyText } from "../payload";
import { ELE_DEFINITIONS, ELE_SCHEMAS } from "./eleme";

/** 官方 §5.2 核验样本逐字（order-signal 全文：键序/number/string 形态照录） */
const GOLDEN_STATUS_BODY =
  '{"push_action":2,"eleme_order_id":"12637645858619059","tp_order_id":"1425223342","new_status":1,"extra":"{}","created_at":"1531987437"}';

/** 官方 §5.3 核验样本逐字（order-delivery-signal 全文；state_code 1234 为官方示意占位照录） */
const GOLDEN_DELIVERY_BODY =
  '{"eleme_order_id":"12374793708765809","tp_order_id":"1425223342","deliveryman_name":"李四","deliveryman_phone":"13800001234","state_code":1234,"update_at":1463943884}';

/** 官方 §5.4 核验样本逐字（order-refund-status 全文） */
const GOLDEN_REFUND_BODY =
  '{"status_code":1,"role":1,"eleme_order_id":"100025663239521904","tp_order_id":"tb1020303434342","update_at":1458721474}';

/** 官方 §5.5 核验样本逐字（order-compensate 全文，页首标注暂不开放） */
const GOLDEN_COMPENSATE_BODY =
  '{"compensate_type":1,"action":1,"hongbao_id":"1234","eleme_order_id":"100967782022644505","tp_order_id":"212433333745","phone":"18843225250","amount":2.7,"sum_condition":27,"begin_date":"2016-07-01","end_date":"2016-07-31","created_at":1469361386}';

/** §5.6 字段表五字段（官方未给载荷样本，值取事实库同源/模拟器占位，见字段说明） */
const GOLDEN_H5_CREATE_BODY =
  "push_action=1&order_id=12637645858619059&user_id=12345&new_status=0&user_state=USER_STATE";
const GOLDEN_H5_UPDATE_BODY =
  "push_action=2&order_id=12637645858619059&user_id=12345&new_status=2&user_state=USER_STATE";

describe("饿了么事件 schema 聚合（用户线推送；SHA1 五步签名在 Rust 适配器）", () => {
  it("v2 订单 4 + H5 表单 2 = 6 模板，id 全仓库唯一且 ele- 前缀", () => {
    expect(ELE_SCHEMAS).toHaveLength(6);
    const ids = ELE_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("ele-"))).toBe(true);
  });

  it("描述文件装载合法，且模板条目与协议模块一一对应", () => {
    expect(ELE_DEFINITIONS.channelId).toBe("eleme");
    expect(ELE_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(ELE_DEFINITIONS.schemas).sort()).toEqual(
      ELE_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("报文形态绑定：v2 订单四推送走 JSON、H5 两推送走 form（§3.1/§5.6 逐字）", () => {
    for (const schema of ELE_SCHEMAS) {
      expect(schema.contentString, `${schema.id} contentString`).toBe(false);
      const isH5 = schema.id.startsWith("ele-h5-");
      expect(schema.wire, `${schema.id} wire`).toBe(isH5 ? "form" : "json");
    }
  });

  it('默认期望回执 = 官方成功应答：HTTP 200 + {"message":"ok"}（§5.1 逐字，JSON 字段子集比对）', () => {
    for (const schema of ELE_SCHEMAS) {
      expect(schema.expected, `${schema.id} expected`).toEqual({
        status: 200,
        body: '{"message":"ok"}',
        bodyMode: "jsonField",
      });
    }
  });

  it("模板载荷逐字对齐事实库核验样本：§5.2/§5.3/§5.4/§5.5 JSON 逐字节 + §5.6 H5 表单字段", () => {
    const bodies = ELE_SCHEMAS.map((schema) =>
      wireBodyText(schema, schema.payload),
    );
    expect(bodies[0]).toBe(GOLDEN_STATUS_BODY);
    expect(bodies[1]).toBe(GOLDEN_DELIVERY_BODY);
    expect(bodies[2]).toBe(GOLDEN_REFUND_BODY);
    expect(bodies[3]).toBe(GOLDEN_COMPENSATE_BODY);
    expect(bodies[4]).toBe(GOLDEN_H5_CREATE_BODY);
    expect(bodies[5]).toBe(GOLDEN_H5_UPDATE_BODY);
  });

  it("v2 订单四推送穷尽官方目录（§2.1：状态/配送/退单/赔偿），赔偿模板注明暂不开放", () => {
    const orderSchemas = ELE_SCHEMAS.filter((schema) =>
      schema.id.startsWith("ele-order-"),
    );
    expect(orderSchemas).toHaveLength(4);
    expect(orderSchemas.map((schema) => schema.eventName)).toEqual([
      "order_status_update",
      "订单配送信息推送",
      "退单状态推送",
      "订单赔偿",
    ]);
    for (const schema of orderSchemas) {
      expect(schema.kind).toBe("event");
    }
    const compensate = orderSchemas.find(
      (schema) => schema.id === "ele-order-compensate",
    );
    expect(compensate?.name).toContain("暂不开放");
  });

  it("订单状态推送：push_action 固定 2（§2.1 逐字），extra 为 JSON 字符串形态（§5.2 样本逐字）", () => {
    const status = ELE_SCHEMAS.find(
      (schema) => schema.id === "ele-order-status-update",
    );
    expect(status?.payload.push_action).toBe(2);
    expect(status?.payload.extra).toBe("{}");
    // 官方样本 created_at 为字符串、new_status 为 number（形态照录）
    expect(status?.payload.created_at).toBe("1531987437");
    expect(status?.payload.new_status).toBe(1);
  });

  it("H5 表单推送：push_action 1/2 穷尽（§5.6 逐字），占位值不作官方样本", () => {
    const h5Schemas = ELE_SCHEMAS.filter((schema) =>
      schema.id.startsWith("ele-h5-"),
    );
    expect(h5Schemas.map((schema) => schema.payload.push_action)).toEqual([
      "1",
      "2",
    ]);
    for (const schema of h5Schemas) {
      // 官方 §5.6 字段表五字段逐字，无多无少
      expect(Object.keys(schema.payload).sort()).toEqual([
        "new_status",
        "order_id",
        "push_action",
        "user_id",
        "user_state",
      ]);
      expect(schema.payload.user_state).toBe("USER_STATE");
    }
  });

  it("字段描述锚定官方枚举与样本值（配送码/退单角色/赔付类型逐字）", () => {
    const descriptionsOf = (id: string) =>
      new Map(
        (ELE_SCHEMAS.find((schema) => schema.id === id)?.fields ?? []).map(
          (field) => [field.path, field.description],
        ),
      );
    expect(descriptionsOf("ele-order-delivery").get("state_code")).toContain(
      "1234",
    );
    expect(descriptionsOf("ele-order-refund").get("role")).toContain(
      "1 用户 / 2 系统",
    );
    expect(
      descriptionsOf("ele-order-compensate").get("compensate_type"),
    ).toContain("1 准时达");
    expect(
      descriptionsOf("ele-order-status-update").get("new_status"),
    ).toContain("11 用户确认");
  });

  it("ID 生成器官方形态：饿了么订单号 17~18 位数字串（首位取 1 恒在 int64 内）", () => {
    for (const id of [
      "ele-order-status-update",
      "ele-order-delivery",
      "ele-order-refund",
      "ele-order-compensate",
    ]) {
      const schema = ELE_SCHEMAS.find((item) => item.id === id);
      expect(schema).toBeDefined();
      if (!schema) return;
      const draft = applyGeneratedIds(schema, structuredClone(schema.payload));
      expect(String(draft.eleme_order_id)).toMatch(/^1\d{16,17}$/);
      expect(draft.eleme_order_id).not.toBe(schema.payload.eleme_order_id);
      // 官方实锤词汇/样本值不重生
      expect(draft.tp_order_id).toBe(schema.payload.tp_order_id);
    }
  });
});
