import { defineSchema } from "../define";
import {
  WECOM_DEFINITIONS,
  WECOM_EXPECTED,
  wcEventEnvelope,
  wcEventIdGenerations,
  wcEventLayout,
} from "./shared";

/**
 * 企微自建应用事件字典 · 扫码/发图/选位置（事实库 §2.2 事件目录）：
 * scancode_push / scancode_waitmsg（ScanCodeInfo{ScanType=qrcode, ScanResult}）、
 * pic_sysphoto / pic_photo_or_album / pic_weixin（SendPicsInfo{Count, PicList.PicMd5Sum}）、
 * location_select（SendLocationInfo{Location_X/Y, Scale, Label, Poiname}）。
 * 嵌套结构体按官方单行形态作为原文片段整体透传（XML 通道未知元素保真规则）。
 */

const SCAN_CODE_INFO =
  "<ScanCodeInfo><ScanType><![CDATA[qrcode]]></ScanType><ScanResult><![CDATA[SCAN_RESULT]]></ScanResult></ScanCodeInfo>";

const SEND_PICS_INFO =
  "<SendPicsInfo><Count>1</Count><PicList><item><PicMd5Sum><![CDATA[PIC_MD5_SUM]]></PicMd5Sum></item></PicList></SendPicsInfo>";

const SEND_LOCATION_INFO =
  "<SendLocationInfo><Location_X><![CDATA[23.137466]]></Location_X><Location_Y><![CDATA[113.352425]]></Location_Y><Scale><![CDATA[15]]></Scale><Label><![CDATA[LABEL]]></Label><Poiname><![CDATA[POINAME]]></Poiname></SendLocationInfo>";

export const WECOM_AGENT_INTERACTION_EVENT_SCHEMAS = [
  defineSchema(WECOM_DEFINITIONS, "wc-scancode-push", {
    eventName: "scancode_push",
    name: "扫码推事件",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcEventEnvelope("scancode_push", {
      EventKey: "EVENTKEY",
      ScanCodeInfo: SCAN_CODE_INFO,
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-scancode-waitmsg", {
    eventName: "scancode_waitmsg",
    name: "扫码且弹提示框",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcEventEnvelope("scancode_waitmsg", {
      EventKey: "EVENTKEY",
      ScanCodeInfo: SCAN_CODE_INFO,
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-pic-sysphoto", {
    eventName: "pic_sysphoto",
    name: "弹出系统拍照发图",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcEventEnvelope("pic_sysphoto", {
      EventKey: "EVENTKEY",
      SendPicsInfo: SEND_PICS_INFO,
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-pic-photo-or-album", {
    eventName: "pic_photo_or_album",
    name: "弹出拍照或相册发图",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcEventEnvelope("pic_photo_or_album", {
      EventKey: "EVENTKEY",
      SendPicsInfo: SEND_PICS_INFO,
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-pic-weixin", {
    eventName: "pic_weixin",
    name: "弹出微信相册发图",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcEventEnvelope("pic_weixin", {
      EventKey: "EVENTKEY",
      SendPicsInfo: SEND_PICS_INFO,
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-location-select", {
    eventName: "location_select",
    name: "弹出地理位置选择器",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcEventEnvelope("location_select", {
      EventKey: "EVENTKEY",
      SendLocationInfo: SEND_LOCATION_INFO,
    }),
  }),
] as const;
