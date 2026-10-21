import { describe, expect, it } from "vitest";

import { applyGeneratedIds } from "../ids";
import { TB_DEFINITIONS, TB_SCHEMAS } from "./taobao";

/** 官方验证样本的公共值（事实库 taobao.md §5.3/§5.4/§5.6/§5.8 逐字） */
const GOLDEN_TRADE_TID = "123456789";
const GOLDEN_REFUND_TID = "110770592823138";
const GOLDEN_REFUND_ID = "592823138";
const GOLDEN_FORWARD_TIMESTAMP = 1603766859530;
const GOLDEN_REVERSE_TIMESTAMP = 1603715010436;
const GOLDEN_OFFMSG_MSG_ID = "6269105334747922432";

describe("淘宝事件 schema 聚合（全球栈 HTTPS 回调；HMAC-SHA256 验签在 Rust 适配器）", () => {
  it("交易/退款 2 + 全球栈回调 2 + OpenIM 1 = 5 模板，id 全仓库唯一且 tb- 前缀", () => {
    expect(TB_SCHEMAS).toHaveLength(5);
    const ids = TB_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("tb-"))).toBe(true);
  });

  it("描述文件分文件合并装载合法，且模板条目与协议模块一一对应", () => {
    expect(TB_DEFINITIONS.channelId).toBe("taobao");
    expect(TB_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(TB_DEFINITIONS.schemas).sort()).toEqual(
      TB_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("报文形态绑定：全部模板走 JSON 明文（数据明文传输，无 AES 无 XML）", () => {
    for (const schema of TB_SCHEMAS) {
      expect(schema.wire, `${schema.id} wire`).toBe("json");
      expect(schema.contentString, `${schema.id} contentString`).toBe(false);
    }
  });

  it("默认期望回执 = 渠道真实应答：HTTP 200 即确认签收（正文无语义，超 500ms 失败半小时后重试最多 12 次）", () => {
    for (const schema of TB_SCHEMAS) {
      // 事实库 §3.2：「收到消息后请返回 HTTP 200 状态码，确认签收消息」——
      // 应答无正文口径，空串 = 只看状态码（Verify 验证同语义）
      expect(schema.expected, `${schema.id} expected`).toEqual({
        status: 200,
        body: "",
        bodyMode: "contains",
      });
    }
  });

  it("TradeCreate 载荷逐字（§5.3 官方样本键序与值，数字字段全字符串形态）", () => {
    const schema = TB_SCHEMAS.find((item) => item.id === "tb-trade-create");
    expect(schema?.eventName).toBe("taobao_trade_TradeCreate");
    expect(Object.keys(schema?.payload ?? {})).toEqual([
      "buyer_nick",
      "buyer_open_uid",
      "payment",
      "oid",
      "seller_nick",
      "type",
      "tid",
      "status",
    ]);
    expect(schema?.payload).toEqual({
      buyer_nick: "碎**",
      buyer_open_uid: "AAGq5d-EAAeG3JedwSFpZMe1",
      payment: "100.00",
      oid: "987654321",
      seller_nick: "麦包包",
      type: "fixed",
      tid: GOLDEN_TRADE_TID,
      status: "TRADE_CREATE",
    });
  });

  it("RefundCreated 载荷逐字（§5.4 官方样本键序与值，modified 为官方样本时刻）", () => {
    const schema = TB_SCHEMAS.find((item) => item.id === "tb-refund-created");
    expect(schema?.eventName).toBe("taobao_refund_RefundCreated");
    expect(Object.keys(schema?.payload ?? {})).toEqual([
      "buyer_nick",
      "buyer_open_uid",
      "refund_phase",
      "refund_fee",
      "bill_type",
      "modified",
      "oid",
      "seller_nick",
      "refund_id",
      "tid",
    ]);
    expect(schema?.payload).toEqual({
      buyer_nick: "碎**",
      buyer_open_uid: "AAGq5d-EAAeG3JedwSFpZMe1",
      refund_phase: "onsale",
      refund_fee: "21.32",
      bill_type: "refund_bill",
      modified: "2000-12-30 12:32:20",
      oid: GOLDEN_REFUND_TID,
      seller_nick: "麦包包",
      refund_id: GOLDEN_REFUND_ID,
      tid: GOLDEN_REFUND_TID,
    });
  });

  it("全球栈回调信封逐字（§5.6 键序 seller_id/message_type/data/timestamp/site，官方样本值含 lazada_vn 原文）", () => {
    const forward = TB_SCHEMAS.find((item) => item.id === "tb-global-forward");
    const reverse = TB_SCHEMAS.find((item) => item.id === "tb-global-reverse");
    expect(forward?.eventName).toBe("unpaid");
    expect(forward?.payload).toEqual({
      seller_id: "1234567",
      message_type: 0,
      data: {
        order_status: "unpaid",
        trade_order_id: "260422900198363",
        trade_order_line_id: "260422900298363",
        status_update_time: 1603698638,
      },
      timestamp: GOLDEN_FORWARD_TIMESTAMP,
      site: "lazada_vn",
    });
    expect(reverse?.eventName).toBe("canceled");
    expect(reverse?.payload).toEqual({
      seller_id: "1000114855",
      message_type: 0,
      data: {
        order_status: "canceled",
        reverse_order_id: "501977696648153",
        reverse_order_line_id: "502491640048153",
        status_update_time: 1603703663,
        trade_order_id: "252883361348153",
        trade_order_line_id: "252883361948153",
      },
      timestamp: GOLDEN_REVERSE_TIMESTAMP,
      site: "lazada_vn",
    });
  });

  it("OffMsgPush 取 §5.8 旺旺 envelope 形态参考逐字（OffMsgPush 载荷全文待核验）", () => {
    const schema = TB_SCHEMAS.find(
      (item) => item.id === "tb-openim-offmsg-push",
    );
    expect(schema?.eventName).toBe("taobao_openim_OffMsgPush");
    expect(schema?.kind).toBe("message");
    expect(schema?.payload).toEqual({
      content: "文本啊啊啊",
      to_id: "it3d3hxlxiaomishu",
      nickname: "it3d3hxltest0",
      from_id: "it3d3hxltest0",
      gmt_send: "1444297001",
      msg_id: GOLDEN_OFFMSG_MSG_ID,
    });
  });

  it("事件目录：交易/退款/全球栈正逆向 4 event + OpenIM 1 message", () => {
    expect(TB_SCHEMAS.map((schema) => schema.id)).toEqual([
      "tb-trade-create",
      "tb-refund-created",
      "tb-global-forward",
      "tb-global-reverse",
      "tb-openim-offmsg-push",
    ]);
    expect(TB_SCHEMAS.map((schema) => schema.kind)).toEqual([
      "event",
      "event",
      "event",
      "event",
      "message",
    ]);
  });

  it("ID 生成器官方形态：tid/oid/refund_id 数字串、modified 官方时刻格式、毫秒/秒级时间戳按信封形态", () => {
    const trade = TB_SCHEMAS.find((item) => item.id === "tb-trade-create");
    expect(trade).toBeDefined();
    if (!trade) return;
    const result = applyGeneratedIds(trade, structuredClone(trade.payload));
    expect(result.tid).toMatch(/^\d{9,15}$/);
    expect(result.oid).toMatch(/^\d{9,15}$/);
    expect(result.tid).not.toBe(GOLDEN_TRADE_TID);

    const refund = TB_SCHEMAS.find((item) => item.id === "tb-refund-created");
    expect(refund).toBeDefined();
    if (!refund) return;
    const refundDraft = applyGeneratedIds(
      refund,
      structuredClone(refund.payload),
    );
    expect(refundDraft.refund_id).toMatch(/^\d{9,15}$/);
    expect(refundDraft.refund_id).not.toBe(GOLDEN_REFUND_ID);
    expect(refundDraft.modified).toMatch(
      /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    );

    const forward = TB_SCHEMAS.find((item) => item.id === "tb-global-forward");
    expect(forward).toBeDefined();
    if (!forward) return;
    const forwardDraft = applyGeneratedIds(
      forward,
      structuredClone(forward.payload),
    );
    expect(String(forwardDraft.timestamp)).toMatch(/^\d{13}$/);
    expect(
      String((forwardDraft.data as Record<string, unknown>).status_update_time),
    ).toMatch(/^\d{10}$/);

    const offmsg = TB_SCHEMAS.find(
      (item) => item.id === "tb-openim-offmsg-push",
    );
    expect(offmsg).toBeDefined();
    if (!offmsg) return;
    const offmsgDraft = applyGeneratedIds(
      offmsg,
      structuredClone(offmsg.payload),
    );
    expect(offmsgDraft.gmt_send).toMatch(/^\d{10}$/);
    expect(offmsgDraft.msg_id).toMatch(/^\d{19}$/);
    expect(offmsgDraft.msg_id).not.toBe(GOLDEN_OFFMSG_MSG_ID);
  });
});
