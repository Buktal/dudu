import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";
import { WECOM_AGENT_MISC_EVENT_SCHEMAS } from "./misc";

describe("企微事件字典 · 域名 IP 与公共邮箱", () => {
  it("提供 security 与 public_email_change 两个模板", () => {
    expect(WECOM_AGENT_MISC_EVENT_SCHEMAS.map((schema) => schema.id)).toEqual([
      "wc-security-change-domain-ip",
      "wc-public-email-receive",
    ]);
  });

  it("security/change_domain_ip 逐字复刻官方 100080 样本（sys 行尾空格）", () => {
    const schema = schemaById("wc-security-change-domain-ip");
    expect(schema.eventName).toBe("security");
    expect(schema.payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "sys",
      CreateTime: "1403610513",
      MsgType: "event",
      Event: "security",
      ChangeType: "change_domain_ip",
    });
    expect(schema.xmlLayout).toEqual({
      indent: "\t",
      bareTags: ["CreateTime"],
      trailingSpaceTags: ["FromUserName"],
    });
    expect(schema.payload.AgentID).toBeUndefined();
  });

  it("public_email_change/receive_email 逐字复刻官方 100180 样本（三空格缩进 + Id/Amount 裸文本）", () => {
    const schema = schemaById("wc-public-email-receive");
    expect(schema.eventName).toBe("public_email_change");
    expect(schema.payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "sys",
      CreateTime: "1668831860",
      MsgType: "event",
      Event: "public_email_change",
      ChangeType: "receive_email",
      Id: "1",
      Amount: "2",
    });
    expect(schema.xmlLayout).toEqual({
      indent: "   ",
      bareTags: ["CreateTime", "Id", "Amount"],
      trailingSpaceTags: ["FromUserName"],
    });
    expect(schema.payload.AgentID).toBeUndefined();
  });
});
