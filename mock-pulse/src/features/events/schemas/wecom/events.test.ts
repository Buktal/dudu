import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";
import { WECOM_AGENT_CORE_EVENT_SCHEMAS } from "./events";

describe("企微事件字典 · 订阅/会话/位置/任务/通讯录", () => {
  it("提供 subscribe/unsubscribe/enter_agent/LOCATION/batch_job_result/change_contact", () => {
    expect(WECOM_AGENT_CORE_EVENT_SCHEMAS.map((schema) => schema.id)).toEqual([
      "wc-subscribe",
      "wc-unsubscribe",
      "wc-enter",
      "wc-location-report",
      "wc-batch-job-result",
      "wc-change-contact",
    ]);
    expect(schemaById("wc-location-report").eventName).toBe("LOCATION");
  });

  it("subscribe 逐字复刻官方 §5.3 黄金样本（无 EventKey、无 MsgId）", () => {
    const payload = schemaById("wc-subscribe").payload;
    expect(payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "UserID",
      CreateTime: "1348831860",
      MsgType: "event",
      Event: "subscribe",
      AgentID: "1",
    });
    expect(payload.MsgId).toBeUndefined();
    expect(payload.EventKey).toBeUndefined();
    // unsubscribe 与 subscribe 同形（§2.2：关注/取消关注）
    expect(schemaById("wc-unsubscribe").payload).toEqual({
      ...payload,
      Event: "unsubscribe",
    });
  });

  it("LOCATION 事件带经纬度/精度/AppType=wxwork，位置数值按裸文本排版", () => {
    const schema = schemaById("wc-location-report");
    expect(schema.payload).toMatchObject({
      Event: "LOCATION",
      Latitude: "23.137466",
      Longitude: "113.352425",
      Precision: "119.385040",
      AppType: "wxwork",
    });
    expect(schema.xmlLayout?.bareTags).toContain("Latitude");
    expect(schema.xmlLayout?.bareTags).toContain("Precision");
  });

  it("batch_job_result 携带 BatchJob 结构体原文片段（JobId/JobType/ErrCode/ErrMsg）", () => {
    const schema = schemaById("wc-batch-job-result");
    expect(typeof schema.payload.BatchJob).toBe("string");
    expect(schema.payload.BatchJob).toContain(
      "<JobType><![CDATA[sync_user]]></JobType>",
    );
    // 嵌套结构体不进描述文件已知字段（XML 已知元素必须纯文本），整体按原文透传
    expect(schema.fields.some((field) => field.path === "BatchJob")).toBe(
      false,
    );
  });

  it("change_contact 逐字复刻官方 §5.4 create_user 样本（sys + 全量成员属性 + ExtAttr）", () => {
    const schema = schemaById("wc-change-contact");
    expect(schema.payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "sys",
      CreateTime: "1403610513",
      MsgType: "event",
      Event: "change_contact",
      ChangeType: "create_user",
      UserID: "zhangsan",
      Name: "张三",
      Department: "1,2,3",
      MainDepartment: "1",
      IsLeaderInDept: "1,0,0",
      DirectLeader: "lisi,wangwu",
      Position: "产品经理",
      Mobile: "13800000000",
      Gender: "1",
      Email: "zhangsan@gzdev.com",
      BizMail: "zhangsan@qyycs2.wecom.work",
      Status: "1",
      Avatar:
        "http://wx.qlogo.cn/mmopen/ajNVdqHZLLA3WJ6DSZUfiakYe37PKnQhBIeOQBO4czqrnZDS79FH5Wm5m4X69TBicnHFlhiafvDwklOpZeXYQQ2icg/0",
      Alias: "zhangsan",
      Telephone: "020-123456",
      Address: "广州市",
      ExtAttr: expect.stringContaining("<ExtAttr>"),
    });
    // 官方原文排版：数值/状态字段裸文本 + FromUserName 行尾空格（tab 缩进）
    expect(schema.xmlLayout).toEqual({
      indent: "\t",
      bareTags: [
        "CreateTime",
        "ChangeType",
        "MainDepartment",
        "Mobile",
        "Gender",
        "Status",
      ],
      trailingSpaceTags: ["FromUserName"],
    });
  });
});
