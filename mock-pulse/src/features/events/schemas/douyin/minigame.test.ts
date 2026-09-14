import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";

describe("抖音小游戏推送模板", () => {
  it("客服消息文本黄金载荷逐字（§5.19 JSON 格式）", () => {
    expect(schemaById("dy-mg-im-text").payload).toEqual({
      ToUserName: "appid",
      FromUserName: "openid",
      CreateTime: 1577364225,
      MsgType: "text",
      Content: "text content",
    });
  });

  it("客服消息图片变体（官方括注：MsgType=image + PicUrl）", () => {
    expect(schemaById("dy-mg-im-image").payload).toEqual({
      ToUserName: "appid",
      FromUserName: "openid",
      CreateTime: 1577364225,
      MsgType: "image",
      PicUrl: "this is image url link",
    });
  });

  it("礼包推送与验证请求按官方已公开形态装载（未公开处注明待核验）", () => {
    // gift_delivery：官方信封形态 + MsgType 占位（适配器据其派生 x-msg-type）
    expect(schemaById("dy-mg-gift").payload).toEqual({
      ToUserName: "tt12321",
      FromUserName: "openid",
      CreateTime: 1577364225,
      MsgType: "gift_delivery",
    });
    // verify_request：官方只公开头集合，报文体未公开
    expect(schemaById("dy-mg-verify").payload).toEqual({});
    expect(schemaById("dy-mg-verify").fields).toEqual([]);
  });

  it("x-msg-type 枚举三事件齐备，验签与信封逻辑在 Rust 适配器（wire=json）", () => {
    expect(
      ["dy-mg-verify", "dy-mg-gift", "dy-mg-im-text", "dy-mg-im-image"].map(
        (id) => schemaById(id).eventName,
      ),
    ).toEqual([
      "verify_request",
      "gift_delivery",
      "douyin_microgame_im",
      "douyin_microgame_im",
    ]);
    for (const id of ["dy-mg-verify", "dy-mg-gift", "dy-mg-im-text"]) {
      expect(schemaById(id).wire).toBe("json");
      expect(schemaById(id).expected).toEqual({
        status: 200,
        body: "",
        bodyMode: "contains",
      });
    }
  });

  it("CreateTime 按 10 位秒级数字重生成（与企微字符串形态区分）", () => {
    expect(schemaById("dy-mg-im-text").idGenerations).toEqual([
      { path: "CreateTime", kind: "createTimeSecNumber" },
    ]);
  });
});
