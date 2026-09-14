import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";
import { WECOM_AGENT_INTERACTION_EVENT_SCHEMAS } from "./interaction";

describe("企微事件字典 · 扫码/发图/选位置", () => {
  it("提供 scancode 两事件 + pic 三事件 + location_select", () => {
    expect(
      WECOM_AGENT_INTERACTION_EVENT_SCHEMAS.map((schema) => schema.id),
    ).toEqual([
      "wc-scancode-push",
      "wc-scancode-waitmsg",
      "wc-pic-sysphoto",
      "wc-pic-photo-or-album",
      "wc-pic-weixin",
      "wc-location-select",
    ]);
  });

  it("扫码事件携带 ScanCodeInfo 结构体（ScanType=qrcode + ScanResult）", () => {
    const scanCodeInfo = schemaById("wc-scancode-push").payload.ScanCodeInfo;
    expect(scanCodeInfo).toBe(
      "<ScanCodeInfo><ScanType><![CDATA[qrcode]]></ScanType><ScanResult><![CDATA[SCAN_RESULT]]></ScanResult></ScanCodeInfo>",
    );
    expect(schemaById("wc-scancode-waitmsg").payload.ScanCodeInfo).toBe(
      scanCodeInfo,
    );
  });

  it("发图事件携带 SendPicsInfo 结构体（Count + PicList.item.PicMd5Sum）", () => {
    for (const id of [
      "wc-pic-sysphoto",
      "wc-pic-photo-or-album",
      "wc-pic-weixin",
    ]) {
      expect(schemaById(id).payload.SendPicsInfo, id).toContain(
        "<PicList><item><PicMd5Sum><![CDATA[PIC_MD5_SUM]]></PicMd5Sum></item></PicList>",
      );
    }
  });

  it("location_select 携带 SendLocationInfo 结构体（经纬度/缩放/地址/Poiname）", () => {
    const info = schemaById("wc-location-select").payload.SendLocationInfo;
    expect(info).toContain("<Location_X><![CDATA[23.137466]]></Location_X>");
    expect(info).toContain("<Poiname><![CDATA[POINAME]]></Poiname>");
  });

  it("嵌套结构体不进描述文件已知字段（XML 已知元素必须纯文本），表单按未知叶子回退", () => {
    for (const schema of WECOM_AGENT_INTERACTION_EVENT_SCHEMAS) {
      const paths = schema.fields.map((field) => field.path);
      expect(paths).toEqual([
        "ToUserName",
        "FromUserName",
        "CreateTime",
        "MsgType",
        "Event",
        "EventKey",
        "AgentID",
      ]);
      // 结构体在载荷里是未知元素（原文片段），不进 knownTags
      expect(paths.some((path) => /Info$/.test(path))).toBe(false);
    }
  });
});
