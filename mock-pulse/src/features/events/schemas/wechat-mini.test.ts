import { describe, expect, it } from "vitest";

import { wireBodyText } from "../payload";
import { MINI_DEFINITIONS, WECHAT_MINI_EVENT_SCHEMAS } from "./wechat-mini";

describe("小程序事件 schema 聚合（XML 为主，三模式加密在 Rust 适配器）", () => {
  it("3 客服接收包 + 进入会话 1 + 授权变更 3 = 7 模板，id 全仓库唯一", () => {
    expect(WECHAT_MINI_EVENT_SCHEMAS).toHaveLength(7);
    const ids = WECHAT_MINI_EVENT_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
    // 事实库 §2.1：客服接收仅 text/image/miniprogrampage 三包
    expect(
      WECHAT_MINI_EVENT_SCHEMAS.filter((schema) => schema.kind === "message"),
    ).toHaveLength(3);
    // 事实库 §2.2 进入会话 1 + §2.4 授权变更 3
    expect(
      WECHAT_MINI_EVENT_SCHEMAS.filter((schema) => schema.kind === "event"),
    ).toHaveLength(4);
  });

  it("描述文件分文件合并装载合法，且模板条目与协议模块一一对应", () => {
    expect(MINI_DEFINITIONS.channelId).toBe("wechat-mini");
    expect(MINI_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(MINI_DEFINITIONS.schemas).sort()).toEqual(
      WECHAT_MINI_EVENT_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("报文形态绑定：全部模板走 XML（双格式取 XML 为主）且带排版规则", () => {
    for (const schema of WECHAT_MINI_EVENT_SCHEMAS) {
      expect(schema.wire, `${schema.id} wire`).toBe("xml");
      expect(schema.xmlLayout, `${schema.id} xmlLayout`).toBeDefined();
      expect(schema.contentString, `${schema.id} contentString`).toBe(false);
    }
  });

  it("默认期望回执 = 渠道真实应答：HTTP 200 + 官方推荐逐字 success（空串/加密回包可在编辑器切换）", () => {
    for (const schema of WECHAT_MINI_EVENT_SCHEMAS) {
      expect(schema.expected, `${schema.id} expected`).toEqual({
        status: 200,
        body: "success",
        bodyMode: "wecomReply",
      });
    }
  });

  it("黄金样本逐字保真：客服文本包逐字节复现官方 XML（§5.3 三空格缩进 + MsgId 裸文本）", () => {
    const text = WECHAT_MINI_EVENT_SCHEMAS.find(
      (schema) => schema.id === "wmn-text",
    );
    expect(text?.payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "fromUser",
      CreateTime: "1482048670",
      MsgType: "text",
      Content: "this is a test",
      MsgId: "1234567890123456",
    });
    if (!text) return;
    expect(wireBodyText(text, text.payload)).toBe(
      [
        "<xml>",
        "   <ToUserName><![CDATA[toUser]]></ToUserName>",
        "   <FromUserName><![CDATA[fromUser]]></FromUserName>",
        "   <CreateTime>1482048670</CreateTime>",
        "   <MsgType><![CDATA[text]]></MsgType>",
        "   <Content><![CDATA[this is a test]]></Content>",
        "   <MsgId>1234567890123456</MsgId>",
        "</xml>",
      ].join("\n"),
    );
  });

  it("黄金样本逐字保真：image/miniprogrampage/进入会话官方样本原样落在载荷", () => {
    const payloadOf = (id: string) =>
      WECHAT_MINI_EVENT_SCHEMAS.find((schema) => schema.id === id)?.payload;
    // §5.4 图片（逐字，XML 同构）
    expect(payloadOf("wmn-image")).toMatchObject({
      PicUrl: "this is a url",
      MediaId: "media_id",
      MsgId: "1234567890123456",
    });
    // §5.4 小程序卡片（逐字，XML 同构；MsgId 官方序在 MsgType 之后，
    // ThumbUrl/ThumbMediaId 官方为空串原样保留）
    expect(payloadOf("wmn-miniprogrampage")).toEqual({
      ToUserName: "toUser",
      FromUserName: "fromUser",
      CreateTime: "1482048670",
      MsgType: "miniprogrampage",
      MsgId: "1234567890123456",
      Title: "title",
      AppId: "appid",
      PagePath: "path",
      ThumbUrl: "",
      ThumbMediaId: "",
    });
    expect(Object.keys(payloadOf("wmn-miniprogrampage") ?? {})).toEqual([
      "ToUserName",
      "FromUserName",
      "CreateTime",
      "MsgType",
      "MsgId",
      "Title",
      "AppId",
      "PagePath",
      "ThumbUrl",
      "ThumbMediaId",
    ]);
    // §5.4 进入会话事件（逐字，XML 同构；事件名 user_enter_tempsession
    // ——官方无 user_enter_session）
    expect(payloadOf("wmn-enter-tempsession")).toEqual({
      ToUserName: "toUser",
      FromUserName: "fromUser",
      CreateTime: "1482048670",
      MsgType: "event",
      Event: "user_enter_tempsession",
      SessionFrom: "sessionFrom",
    });
  });

  it("黄金样本逐字保真：授权撤回逐字节复现官方 XML（§5.7 两空格缩进）", () => {
    const revoke = WECHAT_MINI_EVENT_SCHEMAS.find(
      (schema) => schema.id === "wmn-auth-revoke",
    );
    expect(revoke?.payload).toEqual({
      ToUserName: "gh_870882ca4b1",
      FromUserName: "owAqB1v0ahK_Xlc7GshIDdf2yf7E",
      CreateTime: "1626857200",
      MsgType: "event",
      Event: "user_authorization_revoke",
      OpenID: "owAqB1nqaOYYWl0Ng484G2z5NIwU",
      AppID: "wx13974bf780d3dc89",
      RevokeInfo: "1",
      PluginID: "wx13974bf780d3dc89",
      OpenPID: "G7esq5NVzP76HIHoB95t4CVBP6to",
    });
    if (!revoke) return;
    expect(wireBodyText(revoke, revoke.payload)).toBe(
      [
        "<xml>",
        "  <ToUserName><![CDATA[gh_870882ca4b1]]></ToUserName>",
        "  <FromUserName><![CDATA[owAqB1v0ahK_Xlc7GshIDdf2yf7E]]></FromUserName>",
        "  <CreateTime>1626857200</CreateTime>",
        "  <MsgType><![CDATA[event]]></MsgType>",
        "  <Event><![CDATA[user_authorization_revoke]]></Event>",
        "  <OpenID><![CDATA[owAqB1nqaOYYWl0Ng484G2z5NIwU]]></OpenID>",
        "  <AppID><![CDATA[wx13974bf780d3dc89]]></AppID>",
        "  <RevokeInfo><![CDATA[1]]></RevokeInfo>",
        "  <PluginID><![CDATA[wx13974bf780d3dc89]]></PluginID>",
        "  <OpenPID><![CDATA[G7esq5NVzP76HIHoB95t4CVBP6to]]></OpenPID>",
        "</xml>",
      ].join("\n"),
    );
    // 其余两授权事件官方无整包样本：按同一信封字段表构造，不编造字段
    const payloadOf = (id: string) =>
      WECHAT_MINI_EVENT_SCHEMAS.find((schema) => schema.id === id)?.payload;
    expect(payloadOf("wmn-user-info-modified")).toEqual({
      ToUserName: "gh_870882ca4b1",
      FromUserName: "owAqB1v0ahK_Xlc7GshIDdf2yf7E",
      CreateTime: "1626857200",
      MsgType: "event",
      Event: "user_info_modified",
      OpenID: "owAqB1nqaOYYWl0Ng484G2z5NIwU",
      AppID: "wx13974bf780d3dc89",
    });
    expect(payloadOf("wmn-auth-cancellation")).toEqual({
      ToUserName: "gh_870882ca4b1",
      FromUserName: "owAqB1v0ahK_Xlc7GshIDdf2yf7E",
      CreateTime: "1626857200",
      MsgType: "event",
      Event: "user_authorization_cancellation",
      OpenID: "owAqB1nqaOYYWl0Ng484G2z5NIwU",
      AppID: "wx13974bf780d3dc89",
    });
  });

  it("事件目录对齐官方：客服三包 + user_enter_tempsession + 授权变更三事件", () => {
    expect(WECHAT_MINI_EVENT_SCHEMAS.map((schema) => schema.eventName)).toEqual(
      [
        "text",
        "image",
        "miniprogrampage",
        "user_enter_tempsession",
        "user_info_modified",
        "user_authorization_revoke",
        "user_authorization_cancellation",
      ],
    );
  });
});
