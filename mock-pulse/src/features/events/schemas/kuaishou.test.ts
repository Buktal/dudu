import { describe, expect, it } from "vitest";

import { applyGeneratedIds } from "../ids";
import { KS_DEFINITIONS, KS_SCHEMAS } from "./kuaishou";

/** 官方验证示例的公共值（事实库 kuaishou.md §4.1 逐字） */
const GOLDEN_APP_ID = "ks696650570360602063";
const GOLDEN_PAY_MESSAGE_ID = "76a50e0c-a843-492b-9bc6-463c1b178a9c";
const GOLDEN_PAY_TIMESTAMP = 1631515320564;
/** §3.2 七页逐字一致的应答 message_id 样本（开放域模板信封占位） */
const GOLDEN_WEBHOOK_MESSAGE_ID =
  "ChFvYXV0aC5hY2Nlc3NUb2tlbhJQvpR51x8In46B1sDB";
/** §3.1 测试事件的 data 时间戳（官方样本逐字） */
const GOLDEN_TEST_TIMESTAMP = 1622518497536;

describe("快手事件 schema 聚合（开放域 event 判型 + 支付族 biz_type 判型；kwaisign 验签在 Rust 适配器）", () => {
  it("开放域 3 + 支付回调族 5 = 8 模板，id 全仓库唯一", () => {
    expect(KS_SCHEMAS).toHaveLength(8);
    const ids = KS_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("ks-"))).toBe(true);
  });

  it("描述文件分文件合并装载合法，且模板条目与协议模块一一对应", () => {
    expect(KS_DEFINITIONS.channelId).toBe("kuaishou");
    expect(KS_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(KS_DEFINITIONS.schemas).sort()).toEqual(
      KS_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("报文形态绑定：全部模板走 JSON 明文（kwaisign 在 header，无 AES 无 XML）", () => {
    for (const schema of KS_SCHEMAS) {
      expect(schema.wire, `${schema.id} wire`).toBe("json");
      expect(schema.contentString, `${schema.id} contentString`).toBe(false);
    }
  });

  it("默认期望回执 = 渠道真实应答：HTTP 200 + result=1（jsonField 子集，message_id 回传为额外字段）", () => {
    for (const schema of KS_SCHEMAS) {
      // 事实库 §3.2：result=1 代表成功、其他代表失败并重试；
      // 应答体 {"result":1,"message_id":"<收到的消息 ID>"} 按 JSON 字段子集声明
      expect(schema.expected, `${schema.id} expected`).toEqual({
        status: 200,
        body: '{"result":1}',
        bodyMode: "jsonField",
      });
    }
  });

  it("双判型互斥：开放域信封带 event 无 biz_type，支付族信封带 biz_type 无 event", () => {
    const openIds = ["ks-test", "ks-authorize", "ks-un-authorize"];
    for (const schema of KS_SCHEMAS) {
      const keys = Object.keys(schema.payload);
      if (openIds.includes(schema.id)) {
        expect(keys, `${schema.id} event 判型`).toContain("event");
        expect(keys, `${schema.id} 无 biz_type`).not.toContain("biz_type");
      } else {
        expect(keys, `${schema.id} biz_type 判型`).toContain("biz_type");
        expect(keys, `${schema.id} 无 event`).not.toContain("event");
      }
    }
  });

  it("开放域信封骨架逐字（§2.1 事件页信封五字段键序：app_id/event/timestamp/message_id/data）", () => {
    const openSchemas = KS_SCHEMAS.filter((schema) =>
      ["ks-test", "ks-authorize", "ks-un-authorize"].includes(schema.id),
    );
    expect(openSchemas).toHaveLength(3);
    for (const schema of openSchemas) {
      expect(Object.keys(schema.payload), `${schema.id} 键序`).toEqual([
        "app_id",
        "event",
        "timestamp",
        "message_id",
        "data",
      ]);
      expect(schema.payload.app_id, `${schema.id} app_id`).toBe(GOLDEN_APP_ID);
      expect(schema.payload.message_id, `${schema.id} message_id`).toBe(
        GOLDEN_WEBHOOK_MESSAGE_ID,
      );
    }
  });

  it("TEST 测试事件按 §3.1 逐字：data 只含测试时间戳（官方样本 1622518497536）", () => {
    const schema = KS_SCHEMAS.find((item) => item.id === "ks-test");
    expect(schema?.eventName).toBe("TEST");
    expect(schema?.payload.event).toBe("TEST");
    expect(schema?.payload.data).toEqual({ timestamp: GOLDEN_TEST_TIMESTAMP });
  });

  it("AUTHORIZE / UN_AUTHORIZE data 按事实库字段表（scope 取官方示例，open_id 官方无样本取占位）", () => {
    const payloadOf = (id: string) =>
      KS_SCHEMAS.find((schema) => schema.id === id)?.payload;
    expect(payloadOf("ks-authorize")?.event).toBe("AUTHORIZE");
    expect(payloadOf("ks-authorize")?.data).toEqual({
      open_id: "OPEN_ID",
      scope: ["user_info", "user_video_info"],
      is_new: true,
    });
    expect(payloadOf("ks-un-authorize")?.event).toBe("UN_AUTHORIZE");
    expect(payloadOf("ks-un-authorize")?.data).toEqual({
      open_id: "OPEN_ID",
      scope: ["user_info", "user_video_info"],
    });
  });

  it("支付族信封骨架逐字（§4.1 官方 toSignStr 键序：data/biz_type/message_id/app_id/timestamp）", () => {
    const paySchemas = KS_SCHEMAS.filter((schema) =>
      [
        "ks-payment",
        "ks-refund",
        "ks-settle",
        "ks-withhold",
        "ks-contract",
      ].includes(schema.id),
    );
    expect(paySchemas).toHaveLength(5);
    for (const schema of paySchemas) {
      expect(Object.keys(schema.payload), `${schema.id} 键序`).toEqual([
        "data",
        "biz_type",
        "message_id",
        "app_id",
        "timestamp",
      ]);
      expect(schema.payload.app_id, `${schema.id} app_id`).toBe(GOLDEN_APP_ID);
      expect(schema.payload.timestamp, `${schema.id} timestamp`).toBe(
        GOLDEN_PAY_TIMESTAMP,
      );
      expect(schema.payload.message_id, `${schema.id} message_id`).toBe(
        GOLDEN_PAY_MESSAGE_ID,
      );
    }
  });

  it("支付族判型与 data 状态按事实库枚举逐字（含官方拼写 PAY_FAILD 不误改）", () => {
    const payloadOf = (id: string) =>
      KS_SCHEMAS.find((schema) => schema.id === id)?.payload;
    expect(payloadOf("ks-payment")?.biz_type).toBe("PAYMENT");
    expect(payloadOf("ks-payment")?.data).toEqual({ status: "SUCCESS" });
    expect(payloadOf("ks-refund")?.biz_type).toBe("REFUND");
    expect(payloadOf("ks-refund")?.data).toEqual({ status: "SUCCESS" });
    // 结算能力事实库仅录语义（分账到可提现账户）与地址优先级，无字段表 → data 留空不编造
    expect(payloadOf("ks-settle")?.biz_type).toBe("SETTLE");
    expect(payloadOf("ks-settle")?.data).toEqual({});
    expect(payloadOf("ks-withhold")?.biz_type).toBe("WITHHOLD");
    expect(payloadOf("ks-withhold")?.data).toEqual({
      withhold_state: "PAY_SUCCESS",
    });
    expect(payloadOf("ks-contract")?.biz_type).toBe("CONTRACT");
    expect(payloadOf("ks-contract")?.data).toEqual({
      contract_status: "CONTRACT_SUCCESS",
    });
  });

  it("事件目录：开放域 3 event + 支付族 5 biz_type，全部为 event 类", () => {
    expect(KS_SCHEMAS.map((schema) => schema.eventName)).toEqual([
      "TEST",
      "AUTHORIZE",
      "UN_AUTHORIZE",
      "PAYMENT",
      "REFUND",
      "SETTLE",
      "WITHHOLD",
      "CONTRACT",
    ]);
    expect(KS_SCHEMAS.map((schema) => schema.kind)).toEqual(
      Array(8).fill("event"),
    );
  });

  it("ID 生成器官方形态：timestamp 毫秒数字、message_id 为 UUID 形态（每次随机生成的 ID）", () => {
    const schema = KS_SCHEMAS.find((item) => item.id === "ks-test");
    expect(schema, "ks-test 模板应在表中").toBeDefined();
    if (!schema) return;
    const result = applyGeneratedIds(schema, structuredClone(schema.payload));
    expect(Number.isInteger(result.timestamp)).toBe(true);
    expect(String(result.timestamp)).toMatch(/^\d{13}$/);
    expect(result.message_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    // 黄金样本原值被重生成（幂等键 message_id 随新事件变化）
    expect(result.message_id).not.toBe(schema.payload.message_id);
    // TEST 的 data.timestamp 与信封 timestamp 同值（官方测试语义：回显测试时间戳）
    expect((result.data as Record<string, unknown>).timestamp).toBe(
      result.timestamp,
    );
  });
});
