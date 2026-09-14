import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";

describe("企微事件字典 · 获客助手", () => {
  it("customer_acquisition 默认 friend_request（§2.9 唯一带字段明细的变更类型：LinkId+State）", () => {
    const schema = schemaById("wc-customer-acquisition");
    expect(schema.eventName).toBe("customer_acquisition");
    expect(schema.payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "sys",
      CreateTime: "1403610513",
      MsgType: "event",
      Event: "customer_acquisition",
      ChangeType: "friend_request",
      LinkId: "LINKID",
      State: "teststate",
    });
  });

  it("ChangeType 描述覆盖 §2.9 全部 11 种变更类型（可在表单直接改）", () => {
    const description =
      schemaById("wc-customer-acquisition").fields.find(
        (field) => field.path === "ChangeType",
      )?.description ?? "";
    for (const changeType of [
      "balance_increased",
      "balance_low",
      "balance_exhausted",
      "customer_start_chat",
      "delete_link",
      "del_follow_user",
      "friend_request",
      "link_unavailable",
      "message_from_customer",
      "open_profile",
      "quota_expire_soon",
    ]) {
      expect(description, changeType).toContain(changeType);
    }
  });
});
