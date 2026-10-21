import { describe, expect, it } from "vitest";

import { DOUYIN_DEFINITIONS, DOUYIN_EVENT_SCHEMAS } from "./douyin";
import { ISV_EXPECTED } from "./douyin/shared";
import { schemaById } from "./registry";

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

/** 官方黄金样本 §5.11（im_enter_direct_msg，content 为 json 字符串，逐字） */
const goldenDyEnter = {
  event: "im_enter_direct_msg",
  client_key: "aaaoqobz68a71u1",
  from_user_id: "aaa-8a0b-4c0f-b04f-feba0e909113",
  to_user_id: "aaa-81ec-424c-b738-8693eeaf53ea",
  content:
    '{"conversation_short_id":"@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAOJNyrA+nLFAba/f760zdRmYqig357zEBFWIIcsZD6/UJHKbF2JNw4w==","server_message_id":"@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAPZd5qgKuL1UVbfj460zdRmYqig357zEBi2hwzcxjeRsR2HorFuOHvA==","conversation_type":1,"create_time":1681303286088,"scene_type":4,"user_infos":[{"open_id":"xxxx8a0b-4c0f-b04f-feba0e909113","nick_name":"Hs姝羽","avatar":"https://p6.douyinpic.com/aweme/720x720/xxxx/tos-cn-i-0813_f2c60a21b05d43e68dd6daffd7d5d733.jpeg?from=3782654143"},{"open_id":"xxxx-81ec-424c-b738-8693eeaf53ea","nick_name":"广汽传祺张掖华逸店","avatar":"https://p6.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813_5d0c96b34bcc4068bb6f9f43b609448a.jpeg?from=3782654143"}],"data-im-extra":"123456789","query":"cptName=button","path":"page/componentTpl/componentTpl"}',
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

describe("抖音事件 schema 描述符", () => {
  it("提供 dop 14 + IM 11 + 生活服务 2 + 小游戏 4 + 服务商 2 共 33 个模板，元信息正确", () => {
    expect(DOUYIN_EVENT_SCHEMAS).toHaveLength(33);
    expect(schemaById("dy-text")).toMatchObject({
      channelId: "douyin",
      eventName: "im_receive_msg",
      kind: "message",
      contentString: false,
    });
    expect(schemaById("dy-enter")).toMatchObject({
      eventName: "im_enter_direct_msg",
      kind: "event",
      contentString: true,
    });
    expect(schemaById("dy-mg-im-text")).toMatchObject({
      eventName: "douyin_microgame_im",
      wire: "json",
    });
    expect(schemaById("dy-isv-ticket")).toMatchObject({
      eventName: "component_ticket",
      kind: "event",
    });
  });

  it("模板载荷逐字等于官方黄金样本（§5.10/§5.11/§5.13）", () => {
    expect(schemaById("dy-text").payload).toEqual(goldenDyText);
    expect(schemaById("dy-enter").payload).toEqual(goldenDyEnter);
    expect(schemaById("dy-read").payload).toEqual(goldenDyRead);
  });

  it("描述文件分文件合并装载合法，且模板条目与协议模块一一对应", () => {
    expect(DOUYIN_DEFINITIONS.channelId).toBe("douyin");
    expect(DOUYIN_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(DOUYIN_DEFINITIONS.schemas).sort()).toEqual(
      DOUYIN_EVENT_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("dop/IM 信封发送用户 ID 必填", () => {
    for (const id of ["dy-text", "dy-image", "dy-create-video", "dy-recall"]) {
      const sender = schemaById(id).fields.find(
        (field) => field.path === "from_user_id",
      );
      expect(sender?.required, `${id} from_user_id required`).toBe(true);
    }
  });

  it("IM 消息族的 ID 默认值生成声明覆盖信封与会话 ID（含资料 ID 跟随发送者）", () => {
    for (const id of [
      "dy-text",
      "dy-image",
      "dy-emoji",
      "dy-video",
      "dy-retain-card",
      "dy-leads-phone-card",
      "dy-send-text",
    ]) {
      const generatedPaths = schemaById(id).idGenerations.map(
        (rule) => rule.path,
      );
      expect(generatedPaths, `${id} 信封 ID`).toEqual(
        expect.arrayContaining(["from_user_id", "to_user_id"]),
      );
      expect(generatedPaths, `${id} 会话 ID`).toEqual(
        expect.arrayContaining([
          "content.conversation_short_id",
          "content.create_time",
        ]),
      );
    }

    const profileId = schemaById("dy-text").idGenerations.find(
      (rule) => rule.path === "content.user_infos[0].open_id",
    );
    expect(profileId).toMatchObject({ kind: "openId", sameAs: "from_user_id" });

    const read = schemaById("dy-read").idGenerations;
    expect(
      read.find((rule) => rule.path === "content.read_open_id"),
    ).toMatchObject({ kind: "openId", sameAs: "to_user_id" });
  });

  it("抖音全部模板的线上形态均为 JSON", () => {
    for (const schema of DOUYIN_EVENT_SCHEMAS) {
      expect(schema.wire, `${schema.id} wire`).toBe("json");
      expect(schema.xmlLayout).toBeUndefined();
    }
  });

  it("默认期望回执 = 各体系真实应答语义：dop/生活服务/小游戏 200 正文不校验，服务商 200+success", () => {
    for (const schema of DOUYIN_EVENT_SCHEMAS) {
      if (schema.id.startsWith("dy-isv-")) {
        expect(schema.expected, `${schema.id} expected`).toEqual(ISV_EXPECTED);
      } else {
        expect(schema.expected, `${schema.id} expected`).toEqual({
          status: 200,
          body: "",
          bodyMode: "contains",
        });
      }
    }
  });
});
