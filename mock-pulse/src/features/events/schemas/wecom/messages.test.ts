import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";
import { WECOM_AGENT_MESSAGE_SCHEMAS } from "./messages";

describe("企微成员消息模板（事实库 §2.1 六 MsgType）", () => {
  it("提供 text/image/voice/video/location/link 六个模板", () => {
    expect(WECOM_AGENT_MESSAGE_SCHEMAS.map((schema) => schema.id)).toEqual([
      "wc-text",
      "wc-image",
      "wc-voice",
      "wc-video",
      "wc-location",
      "wc-link",
    ]);
    expect(schemaById("wc-image").eventName).toBe("image");
    expect(schemaById("wc-link").eventName).toBe("link");
  });

  it("公共字段与 §5.2 黄金样本同构：文本消息逐字，其余消息仅换 MsgType 与专有字段", () => {
    expect(schemaById("wc-text").payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "fromUser",
      CreateTime: "1348831860",
      MsgType: "text",
      Content: "this is a test",
      MsgId: "1234567890123456",
      AgentID: "1",
    });
    expect(schemaById("wc-image").payload).toMatchObject({
      ToUserName: "toUser",
      FromUserName: "fromUser",
      CreateTime: "1348831860",
      MsgType: "image",
      PicUrl: "PICURL",
      MediaId: "MEDIAID",
      MsgId: "1234567890123456",
      AgentID: "1",
    });
    expect(schemaById("wc-voice").payload).toMatchObject({
      MsgType: "voice",
      MediaId: "MEDIAID",
      Format: "amr",
    });
    expect(schemaById("wc-video").payload).toMatchObject({
      MsgType: "video",
      MediaId: "MEDIAID",
      ThumbMediaId: "THUMBMEDIAID",
    });
    expect(schemaById("wc-location").payload).toMatchObject({
      MsgType: "location",
      Location_X: "23.137466",
      Location_Y: "113.352425",
      Scale: "15",
      Label: "广州市海珠区客村地铁站A出口",
    });
    expect(schemaById("wc-link").payload).toMatchObject({
      MsgType: "link",
      Title: "TITLE",
      Description: "DESCRIPTION",
      Url: "https://work.weixin.qq.com",
      PicUrl: "PICURL",
    });
  });

  it("字段集 = 官方公共字段 + §2.1 专有字段，专有字段描述可编辑", () => {
    expect(schemaById("wc-link").fields.map((field) => field.path)).toEqual([
      "ToUserName",
      "FromUserName",
      "CreateTime",
      "MsgType",
      "Title",
      "Description",
      "Url",
      "PicUrl",
      "MsgId",
      "AgentID",
    ]);
    const picUrl = schemaById("wc-image").fields.find(
      (field) => field.path === "PicUrl",
    );
    expect(picUrl?.type).toBe("string");
  });

  it("排版与 ID 生成与 §5.2 官方消息样本一致（三空格缩进 + 行尾空格 + MsgId64）", () => {
    for (const schema of WECOM_AGENT_MESSAGE_SCHEMAS) {
      expect(schema.xmlLayout, `${schema.id} xmlLayout`).toEqual({
        indent: "   ",
        bareTags: ["CreateTime", "MsgId", "AgentID"],
        trailingSpaceTags: ["FromUserName"],
      });
      expect(schema.idGenerations.map((rule) => rule.path)).toEqual([
        "CreateTime",
        "MsgId",
      ]);
    }
  });
});
