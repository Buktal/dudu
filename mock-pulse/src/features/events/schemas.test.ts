import { describe, expect, it } from "vitest";

import {
  DOUYIN_EVENT_SCHEMAS,
  type EventSchema,
  schemaById,
  WECOM_EVENT_SCHEMAS,
} from "./schemas";

/** 官方黄金样本 §5.10（IM 文本完整示例，含 user_infos，逐字） */
const goldenDyText = {
  event: "im_receive_msg",
  client_key: "asdfavetgbvasf",
  from_user_id: "aaa-ae9b-4dbf-add1-bf67e4093fab",
  to_user_id: "aaa-7ae0-4399-914a-5eb1df5861ba",
  content: {
    conversation_short_id:
      "@9Vxc1/yDU8sqaS+gN4koEc7912foPPiLPZVyrQmgKVQabPH460zdRmYqig357zEBMaXjKvvhvwY02ISB7llsWQ==",
    server_message_id:
      "@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAPpF2rgykLFgbafb560zdRmYqig357zEBmWXVPshhwyd/y/7BQpXy/w==",
    conversation_type: 1,
    create_time: 1681303285997,
    message_type: "text",
    source: "",
    text: "捷途70",
    index: "1672502407220000",
    user_infos: [
      {
        open_id: "aaa-ae9b-4dbf-add1-bf67e4093fab",
        nick_name: "刘东",
        avatar:
          "https://p3.douyinpic.com/aweme/720x720/xxxxx-avatar/mosaic-legacy_3795_3047680722.jpeg?from=3782654143",
      },
      {
        open_id: "aaa-7ae0-4399-914a-5eb1df5861ba",
        nick_name: "毕节--捷途万丰店",
        avatar:
          "https://p3.douyinpic.com/aweme/720x720/xxxxxx-avatar/tos-cn-avt-0015_6c9ae9afb4e62e2263f98809e3dc5b6a.jpeg?from=3782654143",
      },
    ],
  },
};

/** 官方黄金样本 §5.7（IM 图片消息，逐字；无 text 字段、无 log_id） */
const goldenDyImage = {
  event: "im_receive_msg",
  client_key: "asdfavetgbvasf",
  from_user_id: "ac6479a5-d7a6-4018-84be-c29bfc00000",
  to_user_id: "8067f050-f8cf-4fa3-9357-c29bfc00000",
  content: {
    conversation_short_id:
      "@c29bfc000+MNggFhRkwGuX1ntuc0QfA0VnmRejrzWUBwDdDYrU9MpJSYEVV6/2hKU0il5iay8J99+0t5j3zrbA==",
    server_message_id:
      "@c29bfc000+MNggFhRkwGuX1ntuc0RPc0VHKefj/yWEJ8DtjUrU9MpJSYEVV6/2hKrOcqY1gIxctCXW23v4oW/Q==",
    conversation_type: 1,
    create_time: 1656571939562,
    message_type: "image",
    index: "1672502407220000",
  },
};

/** 官方黄金样本 §5.11（im_enter_direct_msg，content 为 json 字符串，逐字） */
const goldenDyEnter = {
  event: "im_enter_direct_msg",
  client_key: "aaaoqobz68a71u1",
  from_user_id: "aaa-8a0b-4c0f-b04f-feba0e909113",
  to_user_id: "aaa-81ec-424c-b738-8693eeaf53ea",
  content:
    '{"conversation_short_id":"@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAOJNyrA+nLFAba/f760zdRmYqig357zEBFWIIcsZD6/UJHKbF2JNw4w==","server_message_id":"@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAPZd5qgKuL1UVbfj460zdRmYqig357zEBi2hwzcxjeRsR2HorFuOHvA==","conversation_type":1,"create_time":1681303286088,"scene_type":4,"user_infos":[{"open_id":"xxxx8a0b-4c0f-b04f-feba0e909113","nick_name":"Hs姝羽","avatar":"https://p6.douyinpic.com/aweme/720x720/xxxx/tos-cn-i-0813_f2c60a21b05d43e68dd6daffd7d5d733.jpeg?from=3782654143"},{"open_id":"xxxx-81ec-424c-b738-8693eeaf53ea","nick_name":"广汽传祺张掖华逸店","avatar":"https://p6.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813_5d0c96b34bcc4068bb6f9f43b604448a.jpeg?from=3782654143"}],"data-im-extra":"123456789","query":"cptName=button","path":"page/componentTpl/componentTpl"}',
};

/** 官方黄金样本 §5.13（im_message_read，逐字） */
const goldenDyRead = {
  event: "im_message_read",
  client_key: "ttddf8ab4542c7d76601",
  from_user_id: "_000f9pF8lTroNtA9pfLjPohf1qIUzLdiWRs",
  to_user_id: "_000bfeGRgbkwDMMksxyg4auRqXAPGIZk1pl",
  content: {
    conversation_short_id:
      "@4F8A0vXKXctkaiPzY485F6f81WSGOvmFOJB3rwivKFMQaPT00HDnemIujgn96zUFraoX3c4RU8SOd4uRCKWmdg==",
    index: "1672502407220000",
    conversation_type: 1,
    read_open_id: "_000bfeGRgbkwDMMksxyg4auRqXAPGIZk1pl",
  },
};

function paths(schema: EventSchema): string[] {
  return schema.fields.map((field) => field.path);
}

describe("抖音事件 schema 描述符", () => {
  it("提供四个抖音模板，元信息正确", () => {
    const ids = DOUYIN_EVENT_SCHEMAS.map((schema) => schema.id);
    expect(ids).toEqual(["dy-text", "dy-image", "dy-enter", "dy-read"]);

    expect(schemaById("dy-text")).toMatchObject({
      channelId: "douyin",
      eventName: "im_receive_msg",
      kind: "message",
      contentString: false,
    });
    expect(schemaById("dy-image")).toMatchObject({
      eventName: "im_receive_msg",
      kind: "message",
    });
    expect(schemaById("dy-enter")).toMatchObject({
      eventName: "im_enter_direct_msg",
      kind: "event",
      contentString: true,
    });
    expect(schemaById("dy-read")).toMatchObject({
      eventName: "im_message_read",
      kind: "event",
      contentString: false,
    });
  });

  it("模板载荷逐字等于官方黄金样本（§5.10/§5.7/§5.11/§5.13）", () => {
    expect(schemaById("dy-text").payload).toEqual(goldenDyText);
    expect(schemaById("dy-image").payload).toEqual(goldenDyImage);
    expect(schemaById("dy-enter").payload).toEqual(goldenDyEnter);
    expect(schemaById("dy-read").payload).toEqual(goldenDyRead);
  });

  it("schemaById 未命中时抛出明确错误", () => {
    expect(() => schemaById("missing")).toThrow("未知事件模板");
  });

  it("dy-text 字段集与分组来自原型 SCHEMAS", () => {
    expect(paths(schemaById("dy-text"))).toEqual([
      "from_user_id",
      "content.user_infos[0].nick_name",
      "content.user_infos[0].avatar",
      "content.user_infos[0].open_id",
      "content.text",
      "content.message_type",
      "content.conversation_short_id",
      "content.server_message_id",
      "content.conversation_type",
      "content.create_time",
      "content.index",
      "content.source",
      "event",
      "to_user_id",
      "client_key",
      "log_id",
    ]);
  });

  it("dy-image 无 text 字段，dy-enter 含 scene_type，dy-read 含 read_open_id", () => {
    const image = paths(schemaById("dy-image"));
    expect(image).not.toContain("content.text");
    expect(image).toContain("content.message_type");

    const enter = paths(schemaById("dy-enter"));
    expect(enter).toContain("content.scene_type");

    const read = paths(schemaById("dy-read"));
    expect(read).toContain("content.read_open_id");
    expect(read.filter((p) => p === "content.index")).toHaveLength(1);
  });

  it("每个字段都有标题/类型/分组/解释，且发送用户 ID 必填", () => {
    for (const schema of DOUYIN_EVENT_SCHEMAS) {
      for (const field of schema.fields) {
        expect(field.title, `${schema.id}.${field.path} title`).toBeTruthy();
        expect(field.type, `${schema.id}.${field.path} type`).toBeTruthy();
        expect(field.group, `${schema.id}.${field.path} group`).toBeTruthy();
        expect(
          field.description,
          `${schema.id}.${field.path} description`,
        ).toBeTruthy();
      }
      const sender = schema.fields.find(
        (field) => field.path === "from_user_id",
      );
      expect(sender?.required, `${schema.id} from_user_id required`).toBe(true);
    }
  });

  it("ID 默认值生成声明覆盖信封与会话 ID（含资料 ID 跟随发送者）", () => {
    for (const schema of DOUYIN_EVENT_SCHEMAS) {
      const generatedPaths = schema.idGenerations.map(
        (rule) => rule.path,
      ) as string[];
      expect(generatedPaths, `${schema.id} 信封 ID`).toEqual(
        expect.arrayContaining(["from_user_id", "to_user_id", "log_id"]),
      );
      expect(generatedPaths, `${schema.id} 会话 ID`).toEqual(
        expect.arrayContaining([
          "content.conversation_short_id",
          "content.create_time",
        ]),
      );
    }

    const text = schemaById("dy-text").idGenerations;
    const profileId = text.find(
      (rule) => rule.path === "content.user_infos[0].open_id",
    );
    expect(profileId).toMatchObject({ kind: "openId", sameAs: "from_user_id" });

    const read = schemaById("dy-read").idGenerations;
    expect(
      read.find((rule) => rule.path === "content.read_open_id"),
    ).toMatchObject({ kind: "openId", sameAs: "to_user_id" });
  });

  it("抖音模板的线上形态均为 JSON", () => {
    for (const schema of DOUYIN_EVENT_SCHEMAS) {
      expect(schema.wire, `${schema.id} wire`).toBe("json");
      expect(schema.xmlLayout).toBeUndefined();
    }
  });
});

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
});
