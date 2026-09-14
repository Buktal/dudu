import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";

describe("抖音生活服务模板", () => {
  it("verify_webhook 黄金载荷逐字（§3.1：challenge 为数字、content 为 object）", () => {
    expect(schemaById("dy-verify-webhook").payload).toEqual({
      event: "verify_webhook",
      client_key: "",
      content: {
        challenge: 12345,
      },
    });
    // 官方注：验证用的 content 不是 string 类型，而是 object 类型
    expect(schemaById("dy-verify-webhook").contentString).toBe(false);
  });

  it("订单通知黄金载荷逐字（§5.17，content 为 json 字符串原文含空格）", () => {
    expect(schemaById("dy-life-order").payload).toEqual({
      event: "life_trade_order_notify",
      client_key: "axxxxxxxxxxxxx",
      content:
        '{"action": "pay_success","msg_time": 1665991178,"order": {"order_id": "123","pay_amount": 1,  "original_amount": 1,  "account_id": "123","create_time": 1665991178,"pay_time": 1665991178}}',
      log_id: "202210101930530102281180650970B5AF",
    });
    expect(schemaById("dy-life-order").contentString).toBe(true);
  });

  it("期望回执 = 生活服务真实语义：HTTP 200 即成功（官方要求 2.5 秒内应答），正文不校验", () => {
    for (const id of ["dy-verify-webhook", "dy-life-order"]) {
      expect(schemaById(id).expected).toEqual({
        status: 200,
        body: "",
        bodyMode: "contains",
      });
    }
    expect(schemaById("dy-life-order").idGenerations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "content.msg_time" }),
        expect.objectContaining({ path: "log_id" }),
      ]),
    );
  });
});
