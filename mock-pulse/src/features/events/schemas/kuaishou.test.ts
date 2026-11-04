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

describe("快手事件 schema 聚合（开放域 event 判型 + 支付族 biz_type 判型 + 智能客服 type 判型；验签在 Rust 适配器）", () => {
  it("开放域 3 + 支付回调族 5 + 智能客服 6 = 14 模板，id 全仓库唯一", () => {
    expect(KS_SCHEMAS).toHaveLength(14);
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

  it("默认期望回执 = 渠道真实应答：HTTP 200 + result=1（jsonField 子集，开放域 message_id 回传为额外字段）", () => {
    for (const schema of KS_SCHEMAS) {
      // 事实库 §3.2：result=1 代表成功、其他代表失败并重试；应答体
      // {"result":1,"message_id":"<收到的消息 ID>"} 按 JSON 字段子集声明；
      // 智能客服面应答同为 result=1 但无 message_id 回传义务（§6.5.3）
      expect(schema.expected, `${schema.id} expected`).toEqual({
        status: 200,
        body: '{"result":1}',
        bodyMode: "jsonField",
      });
    }
  });

  it("三面判型互斥：开放域 event / 支付族 biz_type / 智能客服 requestId+type", () => {
    const openIds = ["ks-test", "ks-authorize", "ks-un-authorize"];
    const payIds = [
      "ks-payment",
      "ks-refund",
      "ks-settle",
      "ks-withhold",
      "ks-contract",
    ];
    for (const schema of KS_SCHEMAS) {
      const keys = Object.keys(schema.payload);
      if (openIds.includes(schema.id)) {
        expect(keys, `${schema.id} event 判型`).toContain("event");
        expect(keys, `${schema.id} 无 biz_type`).not.toContain("biz_type");
      } else if (payIds.includes(schema.id)) {
        expect(keys, `${schema.id} biz_type 判型`).toContain("biz_type");
        expect(keys, `${schema.id} 无 event`).not.toContain("event");
      } else {
        // 智能客服面（§6.5.3）：requestId 信封 + type 判型，无 event/biz_type
        // （心跳 {"test":true} 例外——推送基座探针无信封）
        if (schema.id !== "ks-cs-heartbeat") {
          expect(keys, `${schema.id} requestId 信封`).toContain("requestId");
          expect(keys, `${schema.id} type 判型`).toContain("type");
        }
        expect(keys, `${schema.id} 无 event`).not.toContain("event");
        expect(keys, `${schema.id} 无 biz_type`).not.toContain("biz_type");
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

  it("事件目录：开放域 3 event + 支付族 5 biz_type + 智能客服心跳/4 消息/转接", () => {
    expect(KS_SCHEMAS.map((schema) => schema.eventName)).toEqual([
      "TEST",
      "AUTHORIZE",
      "UN_AUTHORIZE",
      "PAYMENT",
      "REFUND",
      "SETTLE",
      "WITHHOLD",
      "CONTRACT",
      "test",
      "text",
      "image",
      "item",
      "order",
      "transfer",
    ]);
    // 买家消息四型为 message 类（心跳/转接为平台事件）
    expect(KS_SCHEMAS.map((schema) => schema.kind)).toEqual([
      ...Array(8).fill("event"),
      "event",
      "message",
      "message",
      "message",
      "message",
      "event",
    ]);
  });

  it('智能客服心跳逐字（§6.2 推送基座：保存推送地址即触发 {"test":true}）', () => {
    const schema = KS_SCHEMAS.find((item) => item.id === "ks-cs-heartbeat");
    expect(schema?.payload).toEqual({ test: true });
    // 心跳为平台探针：无幂等键，不声明 ID 生成
    expect(schema?.idGenerations).toEqual([]);
  });

  it("智能客服信封骨架逐字（§6.5.3 body 表键序）+ 推送侧 User 带 openId", () => {
    const csSchemas = KS_SCHEMAS.filter(
      (schema) =>
        schema.id.startsWith("ks-cs-") && schema.id !== "ks-cs-heartbeat",
    );
    expect(csSchemas).toHaveLength(5);
    for (const schema of csSchemas) {
      expect(Object.keys(schema.payload), `${schema.id} 键序`).toEqual([
        "requestId",
        "createTime",
        "generator",
        "type",
        "fromUser",
        "toUser",
        "transferList",
        "message",
        "context",
      ]);
      // 官方示例值：requestId fadbsadfg1323（§6.5.2 入参表）；
      // fromUser 官方示例昵称 快手用户1234（§6.5.2 User 结构）
      expect(schema.payload.requestId).toBe("fadbsadfg1323");
      expect(schema.payload.generator).toBe(1);
      const fromUser = schema.payload.fromUser as Record<string, unknown>;
      expect(fromUser.nickName).toBe("快手用户1234");
      // 推送侧 User 带 openId（§6.5.3 逐字，与发送结构体不对称）
      expect(fromUser.role).toBe(1);
      expect(fromUser.openId).toBe("OPEN_ID");
    }
  });

  it("智能客服消息内容四型 + 转接按官方释义逐字（contentType 枚举与 content 形态）", () => {
    const payloadOf = (id: string) =>
      KS_SCHEMAS.find((schema) => schema.id === id)?.payload;
    const messageOf = (id: string) =>
      payloadOf(id)?.message as Record<string, unknown>;
    // 文本：官方 demo 示例形态 {"text":"你好"}
    expect(messageOf("ks-cs-text")).toEqual({
      contentType: 1,
      content: '{"text":"你好"}',
    });
    // 图片：uri 官方即空串（平台抹除原图链），数值占位
    expect(messageOf("ks-cs-image")).toEqual({
      contentType: 2,
      content: '{"uri":"","width":720,"height":720,"contentLength":102400}',
    });
    // 商品卡片：官方示例逐字 {"text":"$itemId"}
    expect(messageOf("ks-cs-item-card")).toEqual({
      contentType: 1011,
      content: '{"text":"$itemId"}',
    });
    // 订单卡片：官方示例逐字 {"orderId":"12345"}
    expect(messageOf("ks-cs-order-card")).toEqual({
      contentType: 1012,
      content: '{"orderId":"12345"}',
    });
    // 转接（§6.5.3 type=2）：transferList 携带目标客服 role=3
    const transfer = payloadOf("ks-cs-transfer");
    expect(transfer?.type).toBe(2);
    expect(transfer?.transferList).toEqual([
      { nickName: "CUSTOMER_SERVICE_NICK_NAME", role: 3 },
    ]);
  });

  it("智能客服 ID 生成器：requestId 小写字母数字串、createTime 毫秒数字（幂等键随新事件变化）", () => {
    const schema = KS_SCHEMAS.find((item) => item.id === "ks-cs-text");
    expect(schema, "ks-cs-text 模板应在表中").toBeDefined();
    if (!schema) return;
    const result = applyGeneratedIds(schema, structuredClone(schema.payload));
    expect(String(result.createTime)).toMatch(/^\d{13}$/);
    expect(result.requestId).toMatch(/^[a-z0-9]{12,16}$/);
    // 黄金样本原值被重生成（requestId 为唯一请求 ID）
    expect(result.requestId).not.toBe(schema.payload.requestId);
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
