import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";
import { WECOM_AGENT_EXTERNAL_EVENT_SCHEMAS } from "./external";

describe("企微事件字典 · 客户联系（外部联系人/客户群/客户标签）", () => {
  it("提供外部联系人 6 + 客户群 3 + 客户标签 4 共 13 模板", () => {
    expect(
      WECOM_AGENT_EXTERNAL_EVENT_SCHEMAS.map((schema) => schema.id),
    ).toEqual([
      "wc-add-external-contact",
      "wc-edit-external-contact",
      "wc-add-half-external-contact",
      "wc-del-external-contact",
      "wc-del-follow-user",
      "wc-transfer-fail",
      "wc-external-chat-create",
      "wc-external-chat-update",
      "wc-external-chat-dismiss",
      "wc-external-tag-create",
      "wc-external-tag-update",
      "wc-external-tag-delete",
      "wc-external-tag-shuffle",
    ]);
  });

  it("add_external_contact 逐字复刻官方 §5.5 黄金样本（sys + State + WelcomeCode）", () => {
    const schema = schemaById("wc-add-external-contact");
    expect(schema.payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "sys",
      CreateTime: "1403610513",
      MsgType: "event",
      Event: "change_external_contact",
      ChangeType: "add_external_contact",
      UserID: "zhangsan",
      ExternalUserID: "woAJ2GCAAAXtWyujaWJHDDGi0mAAAA",
      State: "teststate",
      WelcomeCode: "WELCOMECODE",
    });
    // §5.5 原文排版：tab 缩进、ChangeType CDATA、FromUserName 行尾空格
    expect(schema.xmlLayout).toEqual({
      indent: "\t",
      bareTags: ["CreateTime"],
      trailingSpaceTags: ["FromUserName"],
    });
  });

  it("其余外部联系人族携带服务人员/客户身份对，不编造官方未收录字段", () => {
    for (const id of [
      "wc-edit-external-contact",
      "wc-add-half-external-contact",
      "wc-del-external-contact",
      "wc-del-follow-user",
      "wc-transfer-fail",
    ]) {
      const schema = schemaById(id);
      expect(schema.payload.Event, `${id} Event`).toBe(
        "change_external_contact",
      );
      expect(schema.payload.UserID, `${id} UserID`).toBe("zhangsan");
      expect(schema.payload.ExternalUserID, `${id} ExternalUserID`).toBe(
        "woAJ2GCAAAXtWyujaWJHDDGi0mAAAA",
      );
      expect(schema.payload.State, `${id} State`).toBeUndefined();
      expect(schema.payload.WelcomeCode, `${id} WelcomeCode`).toBeUndefined();
      expect(Object.keys(schema.payload)).toHaveLength(8);
    }
  });

  it("客户群 3 变更走 change_external_chat，载荷仅 ChangeType（群明细 92128 事实库待核验）", () => {
    for (const [id, changeType] of [
      ["wc-external-chat-create", "create"],
      ["wc-external-chat-update", "update"],
      ["wc-external-chat-dismiss", "dismiss"],
    ] as const) {
      const schema = schemaById(id);
      expect(schema.eventName).toBe("change_external_chat");
      expect(schema.payload.ChangeType).toBe(changeType);
      expect(Object.keys(schema.payload)).toHaveLength(6);
    }
  });

  it("客户标签 4 变更走 change_external_tag，载荷仅 ChangeType", () => {
    for (const [id, changeType] of [
      ["wc-external-tag-create", "create"],
      ["wc-external-tag-update", "update"],
      ["wc-external-tag-delete", "delete"],
      ["wc-external-tag-shuffle", "shuffle"],
    ] as const) {
      const schema = schemaById(id);
      expect(schema.eventName).toBe("change_external_tag");
      expect(schema.payload.ChangeType).toBe(changeType);
      expect(Object.keys(schema.payload)).toHaveLength(6);
    }
  });

  it("全族 FromUserName=sys 且排版沿用 §5.5（tab 缩进 + sys 行尾空格）", () => {
    for (const schema of WECOM_AGENT_EXTERNAL_EVENT_SCHEMAS) {
      expect(schema.payload.FromUserName, `${schema.id} FromUserName`).toBe(
        "sys",
      );
      expect(schema.xmlLayout, `${schema.id} xmlLayout`).toEqual({
        indent: "\t",
        bareTags: ["CreateTime"],
        trailingSpaceTags: ["FromUserName"],
      });
    }
  });
});
