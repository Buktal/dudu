import { describe, expect, it } from "vitest";

import { MP_DEFINITIONS, WECHAT_MP_EVENT_SCHEMAS } from "./wechat-mp";

describe("公众号事件 schema 聚合（仅 XML，三模式加密在 Rust 适配器）", () => {
  it("7 普通消息 + 6 基础事件 + 菜单扩展 8 形态 + 回执 5 事件 = 26 模板，id 全仓库唯一", () => {
    expect(WECHAT_MP_EVENT_SCHEMAS).toHaveLength(26);
    const ids = WECHAT_MP_EVENT_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
    // 事实库 §2.1 七 MsgType
    expect(
      WECHAT_MP_EVENT_SCHEMAS.filter((schema) => schema.kind === "message"),
    ).toHaveLength(7);
    // 事实库 §2.2 六基础事件 + §2.3 菜单页九事件（CLICK 重申与基础事件共形，
    // 独立形态 8 个）+ §2.4/§2.5 回执 5 事件
    expect(
      WECHAT_MP_EVENT_SCHEMAS.filter((schema) => schema.kind === "event"),
    ).toHaveLength(19);
  });

  it("描述文件分文件合并装载合法，且模板条目与协议模块一一对应", () => {
    expect(MP_DEFINITIONS.channelId).toBe("wechat-mp");
    expect(MP_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(MP_DEFINITIONS.schemas).sort()).toEqual(
      WECHAT_MP_EVENT_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("报文形态绑定：全部模板走 XML（官方仅 XML）且带排版规则", () => {
    for (const schema of WECHAT_MP_EVENT_SCHEMAS) {
      expect(schema.wire, `${schema.id} wire`).toBe("xml");
      expect(schema.xmlLayout, `${schema.id} xmlLayout`).toBeDefined();
      expect(schema.contentString, `${schema.id} contentString`).toBe(false);
    }
  });

  it("默认期望回执 = 渠道真实应答：HTTP 200 + 官方推荐逐字 success（空串/加密被动回复可在编辑器切换）", () => {
    for (const schema of WECHAT_MP_EVENT_SCHEMAS) {
      expect(schema.expected, `${schema.id} expected`).toEqual({
        status: 200,
        body: "success",
        bodyMode: "wecomReply",
      });
    }
  });

  it("黄金样本逐字保真：text/voice/subscribe/LOCATION/菜单/回执官方样本原样落在载荷", () => {
    const payloadOf = (id: string) =>
      WECHAT_MP_EVENT_SCHEMAS.find((schema) => schema.id === id)?.payload;
    // §5.1 文本（逐字）
    expect(payloadOf("wm-text")).toMatchObject({
      ToUserName: "toUser",
      FromUserName: "fromUser",
      CreateTime: "1348831860",
      MsgType: "text",
      Content: "this is a test",
      MsgId: "1234567890123456",
      MsgDataId: "xxxx",
      Idx: "xxxx",
    });
    // §5.3 语音（逐字，含 MediaId16K 公众号独有字段）
    expect(payloadOf("wm-voice")).toMatchObject({
      CreateTime: "1357290913",
      MediaId: "media_id",
      Format: "Format",
      MediaId16K: "media_id_16k",
    });
    // §5.5 subscribe（逐字，FromUser 大小写原文如此）
    expect(payloadOf("wm-subscribe")).toMatchObject({
      FromUserName: "FromUser",
      CreateTime: "123456789",
    });
    // §5.6 LOCATION（逐字，数值裸文本）
    expect(payloadOf("wm-location-report")).toMatchObject({
      Latitude: "23.137466",
      Longitude: "113.352425",
      Precision: "119.385040",
    });
    // §5.8 菜单扫码（逐字身份 + 嵌套原文片段）
    expect(payloadOf("wm-scancode-push")).toMatchObject({
      ToUserName: "gh_e136c6e50636",
      FromUserName: "oMgHVjngRipVsoxg6TuX3vz6glDg",
      CreateTime: "1408090502",
      EventKey: "6",
    });
    expect(payloadOf("wm-scancode-push")?.ScanCodeInfo).toContain(
      "<ScanResult><![CDATA[1]]></ScanResult>",
    );
    // §5.9 pic 系（PicMd5Sum 官方值）
    expect(payloadOf("wm-pic-sysphoto")?.SendPicsInfo).toContain(
      "1b5f7c23b5bf75682a53e7b6d163e185",
    );
    // §5.10 location_select（Label 首尾空格逐字）
    expect(payloadOf("wm-location-select")?.SendLocationInfo).toContain(
      "<Label><![CDATA[ 广州市海珠区客村艺苑路 106号]]></Label>",
    );
    // §5.11 模板回执（逐字）
    expect(payloadOf("wm-template-send-job-finish")).toEqual({
      ToUserName: "gh_7f083739789a",
      FromUserName: "oia2TjuEGTNoeX76QEjQNrcURxG8",
      CreateTime: "1395658920",
      MsgType: "event",
      Event: "TEMPLATESENDJOBFINISH",
      MsgID: "200163836",
      Status: "success",
    });
    // §5.12 订阅通知（官方样本身份 + MsgID/ErrorCode 数值）
    expect(payloadOf("wm-subscribe-msg-sent")).toMatchObject({
      ToUserName: "gh_123456789abc",
      FromUserName: "otFpruAK8D-E6EfStSYonYSBZ8_4",
    });
    expect(payloadOf("wm-subscribe-msg-sent")?.SubscribeMsgSentEvent).toContain(
      "<MsgID>1700827132819554304</MsgID>",
    );
    // 群发回执 FromUserName 固定 mphelper（§2.4）
    expect(payloadOf("wm-masssend-job-finish")).toMatchObject({
      FromUserName: "mphelper",
      Status: "send success",
    });
  });

  it("事件目录对齐官方：LOCATION/SCAN/TEMPLATESENDJOBFINISH/MASSSENDJOBFINISH 全大写等原文大小写", () => {
    const eventNames = WECHAT_MP_EVENT_SCHEMAS.filter(
      (schema) => schema.kind === "event",
    ).map((schema) => schema.eventName);
    expect(eventNames).toEqual([
      // 基础事件 §2.2
      "subscribe",
      "unsubscribe",
      "SCAN",
      "LOCATION",
      "CLICK",
      "VIEW",
      // 菜单扩展 §2.3（CLICK 重申共用 wm-click，不重复列）
      "scancode_push",
      "scancode_waitmsg",
      "pic_sysphoto",
      "pic_photo_or_album",
      "pic_weixin",
      "location_select",
      "VIEW",
      "view_miniprogram",
      // 回执 §2.4/§2.5
      "TEMPLATESENDJOBFINISH",
      "MASSSENDJOBFINISH",
      "subscribe_msg_popup_event",
      "subscribe_msg_change_event",
      "subscribe_msg_sent_event",
    ]);
  });
});
