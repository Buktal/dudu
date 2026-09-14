import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";
import { WECOM_AGENT_CONTACT_EVENT_SCHEMAS } from "./contact";

describe("企微事件字典 · 通讯录与家校变更", () => {
  it("提供 change_contact 6 族员 + 家校 11 族员，共 17 模板", () => {
    expect(
      WECOM_AGENT_CONTACT_EVENT_SCHEMAS.map((schema) => schema.id),
    ).toEqual([
      "wc-update-user",
      "wc-delete-user",
      "wc-create-party",
      "wc-update-party",
      "wc-delete-party",
      "wc-update-tag",
      "wc-school-create-student",
      "wc-school-update-student",
      "wc-school-delete-student",
      "wc-school-create-parent",
      "wc-school-update-parent",
      "wc-school-delete-parent",
      "wc-school-subscribe",
      "wc-school-unsubscribe",
      "wc-school-create-deparmtment",
      "wc-school-update-deparmtment",
      "wc-school-delete-deparmtment",
    ]);
  });

  it("全部 FromUserName=sys，与 create_user 黄金样本一致不携带 AgentID/MsgId", () => {
    for (const schema of WECOM_AGENT_CONTACT_EVENT_SCHEMAS) {
      expect(schema.payload.FromUserName, `${schema.id} FromUserName`).toBe(
        "sys",
      );
      expect(schema.payload.AgentID, `${schema.id} AgentID`).toBeUndefined();
      expect(schema.payload.MsgId, `${schema.id} MsgId`).toBeUndefined();
    }
  });

  it("update_user 携带 UserID/NewUserID/Department（官方 2022-08-15 后精简回调三字段）", () => {
    const schema = schemaById("wc-update-user");
    expect(schema.payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "sys",
      CreateTime: "1403610513",
      MsgType: "event",
      Event: "change_contact",
      ChangeType: "update_user",
      UserID: "zhangsan",
      NewUserID: "zhangsan1",
      Department: "1,2,3",
    });
  });

  it("delete_user 仅 UserID；delete_party 仅 Id（§2.3 专有字段表）", () => {
    expect(schemaById("wc-delete-user").payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "sys",
      CreateTime: "1403610513",
      MsgType: "event",
      Event: "change_contact",
      ChangeType: "delete_user",
      UserID: "zhangsan",
    });
    expect(schemaById("wc-delete-party").payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "sys",
      CreateTime: "1403610513",
      MsgType: "event",
      Event: "change_contact",
      ChangeType: "delete_party",
      Id: "2",
    });
  });

  it("create_party/update_party 按 90971 字段表（Id/Name/ParentId/Order，数值裸文本）", () => {
    const create = schemaById("wc-create-party");
    expect(create.payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "sys",
      CreateTime: "1403610513",
      MsgType: "event",
      Event: "change_contact",
      ChangeType: "create_party",
      Id: "2",
      Name: "研发部",
      ParentId: "1",
      Order: "10",
    });
    expect(create.xmlLayout?.bareTags).toEqual(
      expect.arrayContaining(["ChangeType", "Id", "ParentId", "Order"]),
    );
    expect(schemaById("wc-update-party").payload).toMatchObject({
      ChangeType: "update_party",
      Id: "2",
      Name: "研发部",
      ParentId: "1",
    });
  });

  it("update_tag 按官方 90972 页形态：ChangeType 与列表字段走 CDATA", () => {
    const schema = schemaById("wc-update-tag");
    expect(schema.payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "sys",
      CreateTime: "1403610513",
      MsgType: "event",
      Event: "change_contact",
      ChangeType: "update_tag",
      TagId: "1",
      AddUserItems: "zhangsan,lisi",
      DelUserItems: "wangwu",
      AddPartyItems: "2",
      DelPartyItems: "3",
    });
    expect(schema.xmlLayout).toEqual({
      indent: "\t",
      bareTags: ["CreateTime"],
    });
  });

  it("家校 11 族 ChangeType 官方笔误 deparmtment 照抄，载荷极简仅 Id", () => {
    const school = WECOM_AGENT_CONTACT_EVENT_SCHEMAS.filter((schema) =>
      schema.id.startsWith("wc-school-"),
    );
    expect(school.map((schema) => schema.payload.ChangeType)).toEqual([
      "create_student",
      "update_student",
      "delete_student",
      "create_parent",
      "update_parent",
      "delete_parent",
      "subscribe",
      "unsubscribe",
      "create_deparmtment",
      "update_deparmtment",
      "delete_deparmtment",
    ]);
    for (const schema of school) {
      expect(schema.payload.Id, `${schema.id} Id`).toBeTruthy();
      expect(schema.eventName).toBe("change_school_contact");
      expect(Object.keys(schema.payload)).toHaveLength(7);
    }
    // 部门族 Id 为数字：官方数字化字段裸文本输出；学生/家长族 Id 为 userid
    expect(
      schemaById("wc-school-create-deparmtment").xmlLayout?.bareTags,
    ).toContain("Id");
    expect(
      schemaById("wc-school-create-student").xmlLayout?.bareTags,
    ).not.toContain("Id");
  });

  it("嵌套结构体不进描述文件已知字段：ExtAttr 移出 wc-change-contact（XML 已知元素必须纯文本）", () => {
    expect(
      schemaById("wc-change-contact").fields.some(
        (field) => field.path === "ExtAttr",
      ),
    ).toBe(false);
  });
});
