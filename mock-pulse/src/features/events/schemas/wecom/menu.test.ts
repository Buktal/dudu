import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";
import { WECOM_AGENT_MENU_EVENT_SCHEMAS } from "./menu";

describe("企微事件字典 · 菜单跳转", () => {
  it("提供 click/view/view_miniprogram 三个菜单事件", () => {
    expect(WECOM_AGENT_MENU_EVENT_SCHEMAS.map((schema) => schema.id)).toEqual([
      "wc-click",
      "wc-view",
      "wc-view-miniprogram",
    ]);
  });

  it("EventKey 分别对应菜单 key / URL / 小程序路径（官方 §2.2）", () => {
    expect(schemaById("wc-click").payload).toMatchObject({
      Event: "click",
      EventKey: "EVENTKEY",
    });
    expect(schemaById("wc-view").payload).toMatchObject({
      Event: "view",
      EventKey: "https://work.weixin.qq.com",
    });
    expect(schemaById("wc-view-miniprogram").payload).toMatchObject({
      Event: "view_miniprogram",
      EventKey: "pages/index/index.html",
    });
    // 菜单事件共用 tab 缩进事件排版、只重生成 CreateTime
    for (const schema of WECOM_AGENT_MENU_EVENT_SCHEMAS) {
      expect(schema.xmlLayout?.indent).toBe("\t");
      expect(schema.idGenerations.map((rule) => rule.path)).toEqual([
        "CreateTime",
      ]);
      expect(schema.payload.MsgId).toBeUndefined();
    }
  });
});
