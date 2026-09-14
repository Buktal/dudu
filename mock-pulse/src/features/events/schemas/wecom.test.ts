import { describe, expect, it } from "vitest";

import { schemaById } from "./registry";
import { WECOM_DEFINITIONS, WECOM_EVENT_SCHEMAS } from "./wecom";

describe("企业微信事件 schema 描述符", () => {
  it("提供三个企微模板，元信息正确（wire = xml）", () => {
    const ids = WECOM_EVENT_SCHEMAS.map((schema) => schema.id);
    expect(ids).toEqual(["wc-text", "wc-enter", "wc-click"]);

    expect(schemaById("wc-text")).toMatchObject({
      channelId: "wecom",
      eventName: "text",
      kind: "message",
      wire: "xml",
      contentString: false,
    });
    expect(schemaById("wc-enter")).toMatchObject({
      channelId: "wecom",
      eventName: "enter_agent",
      kind: "event",
      wire: "xml",
    });
    expect(schemaById("wc-click")).toMatchObject({
      channelId: "wecom",
      eventName: "click",
      kind: "event",
      wire: "xml",
    });
    // schemaById 覆盖全部渠道模板
    expect(schemaById("wc-click").name).toBeTruthy();
  });

  it("模板载荷逐字等于官方黄金样本（§5.2 文本 + §2.2 事件字段集）", () => {
    expect(schemaById("wc-text").payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "fromUser",
      CreateTime: "1348831860",
      MsgType: "text",
      Content: "this is a test",
      MsgId: "1234567890123456",
      AgentID: "1",
    });
    // enter_agent：EventKey 为空；click：EventKey 为菜单 key（§2.2）
    expect(schemaById("wc-enter").payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "UserID",
      CreateTime: "1348831860",
      MsgType: "event",
      Event: "enter_agent",
      EventKey: "",
      AgentID: "1",
    });
    expect(schemaById("wc-click").payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "UserID",
      CreateTime: "1348831860",
      MsgType: "event",
      Event: "click",
      EventKey: "EVENTKEY",
      AgentID: "1",
    });
    // 事件模板无 MsgId（官方事件推送不携带）
    expect(schemaById("wc-enter").payload.MsgId).toBeUndefined();
    expect(schemaById("wc-click").payload.MsgId).toBeUndefined();
  });

  it("描述文件装载合法，且模板条目与协议模块一一对应", () => {
    expect(WECOM_DEFINITIONS.channelId).toBe("wecom");
    expect(WECOM_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(WECOM_DEFINITIONS.schemas).sort()).toEqual(
      WECOM_EVENT_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("字段集 = 官方公共字段 + 事件专有字段，不伪造昵称/头像（企微文本回调没有）", () => {
    const text = schemaById("wc-text");
    expect(text.fields.map((field) => field.path)).toEqual([
      "ToUserName",
      "FromUserName",
      "CreateTime",
      "MsgType",
      "Content",
      "MsgId",
      "AgentID",
    ]);
    // 规格红线：企微文本回调没有昵称/头像字段
    for (const schema of WECOM_EVENT_SCHEMAS) {
      const joined = schema.fields.map((field) => field.path).join(" ");
      expect(joined, `${schema.id} 不得伪造昵称/头像`).not.toMatch(
        /nick|avatar|头像|昵称/i,
      );
    }
    const enter = schemaById("wc-enter").fields.map((field) => field.path);
    expect(enter).toEqual([
      "ToUserName",
      "FromUserName",
      "CreateTime",
      "MsgType",
      "Event",
      "EventKey",
      "AgentID",
    ]);
    expect(schemaById("wc-click").fields.map((field) => field.path)).toEqual(
      enter,
    );
  });

  it("每个字段都有标题/类型/分组/解释，MsgId 为字符串大数语义", () => {
    for (const schema of WECOM_EVENT_SCHEMAS) {
      for (const field of schema.fields) {
        expect(field.title, `${schema.id}.${field.path} title`).toBeTruthy();
        expect(field.type, `${schema.id}.${field.path} type`).toBeTruthy();
        expect(field.group, `${schema.id}.${field.path} group`).toBeTruthy();
        expect(
          field.description,
          `${schema.id}.${field.path} description`,
        ).toBeTruthy();
      }
    }
    const msgId = schemaById("wc-text").fields.find(
      (field) => field.path === "MsgId",
    );
    expect(msgId?.type).toBe("numberString");
    expect(typeof schemaById("wc-text").payload.MsgId).toBe("string");
  });

  it("xmlLayout 按官方样本排版：文本三空格 + FromUserName 行尾空格，事件 tab", () => {
    expect(schemaById("wc-text").xmlLayout).toEqual({
      indent: "   ",
      bareTags: ["CreateTime", "MsgId", "AgentID"],
      trailingSpaceTags: ["FromUserName"],
    });
    expect(schemaById("wc-enter").xmlLayout).toEqual({
      indent: "\t",
      bareTags: ["CreateTime", "MsgId", "AgentID"],
    });
    expect(schemaById("wc-click").xmlLayout).toEqual(
      schemaById("wc-enter").xmlLayout,
    );
  });

  it("新建 ID 生成声明：文本重生成 MsgId 与秒级 CreateTime，事件仅 CreateTime", () => {
    expect(
      schemaById("wc-text").idGenerations.map((rule) => rule.path),
    ).toEqual(["CreateTime", "MsgId"]);
    expect(
      schemaById("wc-enter").idGenerations.map((rule) => rule.path),
    ).toEqual(["CreateTime"]);
    expect(
      schemaById("wc-click").idGenerations.map((rule) => rule.path),
    ).toEqual(["CreateTime"]);
    expect(
      schemaById("wc-text").idGenerations.find((rule) => rule.path === "MsgId")
        ?.kind,
    ).toBe("msgId64");
    expect(
      schemaById("wc-enter").idGenerations.find(
        (rule) => rule.path === "CreateTime",
      )?.kind,
    ).toBe("createTimeSec");
  });

  it("默认期望回执 = 渠道真实应答：HTTP 200，企微回执形态且留空（原样回空串）", () => {
    for (const schema of WECOM_EVENT_SCHEMAS) {
      expect(schema.expected, `${schema.id} expected`).toEqual({
        status: 200,
        body: "",
        bodyMode: "wecomReply",
      });
    }
  });
});
