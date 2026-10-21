import { describe, expect, it } from "vitest";

import { applyGeneratedIds } from "../ids";
import { wireBodyText } from "../payload";
import { MT_DEFINITIONS, MT_SCHEMAS } from "./meituan";

/** 官方 §5.3 核验样本逐字（docDetail/177/180 关键字段） */
const GOLDEN_ORDER_BODY =
  "order_id=27061900338318741&order_tag_list=8&wm_order_id_view=27061900338318741&app_poi_code=668921&wm_poi_name=%E8%8D%AF%E5%93%8101%E5%BA%97&recipient_phone=13812345678_1236&backup_recipient_phone=%5B%2213812345678_1236%22%2C%2213812345678_3456%22%5D&delivery_time=0&pay_type=2&logistics_code=0000";

/** 官方 §5.4 字段表逐字（biz_type 固定 1；push_content 占位不作官方样本） */
const GOLDEN_IM_BODY =
  "biz_type=1&app_poi_code=668921&push_content=PUSH_CONTENT&extended_field=";

describe("美团事件 schema 聚合（合作中心表单回调；MD5(url?字母序+secret) 签名在 Rust 适配器）", () => {
  it("订单三态 3 + IM 单聊 1 = 4 模板，id 全仓库唯一且 mt- 前缀", () => {
    expect(MT_SCHEMAS).toHaveLength(4);
    const ids = MT_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("mt-"))).toBe(true);
  });

  it("描述文件装载合法，且模板条目与协议模块一一对应", () => {
    expect(MT_DEFINITIONS.channelId).toBe("meituan");
    expect(MT_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(MT_DEFINITIONS.schemas).sort()).toEqual(
      MT_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("报文形态绑定：全部模板走 form 表单明文（官方「所有参数均为普通 POST 表单参数而非 JSON」§3.1 逐字）", () => {
    for (const schema of MT_SCHEMAS) {
      expect(schema.wire, `${schema.id} wire`).toBe("form");
      expect(schema.contentString, `${schema.id} contentString`).toBe(false);
    }
  });

  it('默认期望回执 = 渠道真实应答：订单类 {"data":"ok"} 小写、IM 类 {"data":"OK"} 大写（§5.2 逐字，JSON 字段子集比对）', () => {
    for (const schema of MT_SCHEMAS) {
      const expected =
        schema.id === "mt-im-single-chat"
          ? { status: 200, body: '{"data":"OK"}', bodyMode: "jsonField" }
          : { status: 200, body: '{"data":"ok"}', bodyMode: "jsonField" };
      expect(schema.expected, `${schema.id} expected`).toEqual(expected);
    }
  });

  it("模板载荷逐字对齐事实库核验样本：§5.3 订单字段族 + §5.4 IM 字段表，线上表单字节逐字", () => {
    const bodies = MT_SCHEMAS.map((schema) =>
      wireBodyText(schema, schema.payload),
    );
    expect(bodies[0]).toBe(GOLDEN_ORDER_BODY);
    expect(bodies[1]).toBe(GOLDEN_ORDER_BODY);
    expect(bodies[2]).toBe(GOLDEN_ORDER_BODY);
    expect(bodies[3]).toBe(GOLDEN_IM_BODY);
  });

  it("订单三态推送：eventName 全目录穷尽官方接口名（§2.1 逐字），推送类型由回调 URL 区分", () => {
    const orderSchemas = MT_SCHEMAS.filter((schema) =>
      schema.id.startsWith("mt-order-"),
    );
    expect(orderSchemas).toHaveLength(3);
    expect(orderSchemas.map((schema) => schema.eventName)).toEqual([
      "推送已支付订单",
      "推送已确认订单",
      "推送已完成订单",
    ]);
    for (const schema of orderSchemas) {
      expect(schema.kind).toBe("event");
      // 官方按推送项逐项配置回调 URL（§3.1），载荷内无实锤 status 字段
      expect("status" in schema.payload, `${schema.id} 无 status 字段`).toBe(
        false,
      );
      // 名称锚定官方状态码口径（2/4/8）
      expect(schema.name).toMatch(/status=(2|4|8)/);
    }
  });

  it("IM 单聊回调：biz_type 固定 1（§5.4 逐字），kind 为 message，应答大写 OK", () => {
    const im = MT_SCHEMAS.find((schema) => schema.id === "mt-im-single-chat");
    expect(im).toBeDefined();
    expect(im?.eventName).toBe("消息回调-单聊消息");
    expect(im?.kind).toBe("message");
    // form 线上值恒为文本：标量按线上文本形态存储（同 XML 先例），字段类型
    // （number）管编辑器输入校验
    expect(im?.payload.biz_type).toBe("1");
    expect(im?.expected.body).toBe('{"data":"OK"}');
    // push_content 结构待核验(09-27)：占位值不作官方样本
    expect(im?.payload.push_content).toBe("PUSH_CONTENT");
  });

  it("订单字段描述锚定官方核验样本值（隐私号/门店/药品店名逐字）", () => {
    const order = MT_SCHEMAS.find(
      (schema) => schema.id === "mt-order-confirmed",
    );
    const descriptions = new Map(
      (order?.fields ?? []).map((field) => [field.path, field.description]),
    );
    expect(descriptions.get("order_id")).toContain("27061900338318741");
    expect(descriptions.get("recipient_phone")).toContain("13812345678_1236");
    expect(descriptions.get("wm_poi_name")).toContain("药品01店");
    expect(descriptions.get("pay_type")).toContain("2-在线支付");
  });

  it("ID 生成器官方形态：订单号 15~17 位数字串（bigint(20) 同族），展示 ID 跟随同值", () => {
    const schema = MT_SCHEMAS.find((item) => item.id === "mt-order-confirmed");
    expect(schema).toBeDefined();
    if (!schema) return;
    const draft = applyGeneratedIds(schema, structuredClone(schema.payload));
    expect(String(draft.order_id)).toMatch(/^[1-9]\d{14,16}$/);
    expect(draft.order_id).not.toBe(schema.payload.order_id);
    // 展示 ID 与订单号同值（官方样本两 ID 一致）
    expect(draft.wm_order_id_view).toBe(draft.order_id);
    // 官方实锤词汇/样本值不重生
    expect(draft.pay_type).toBe(schema.payload.pay_type);
    expect(draft.app_poi_code).toBe(schema.payload.app_poi_code);
  });
});
