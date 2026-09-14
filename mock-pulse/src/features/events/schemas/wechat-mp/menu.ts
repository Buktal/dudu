import { defineSchema } from "../define";
import {
  MP_DEFINITIONS,
  MP_EXPECTED,
  mpEventIdGenerations,
  mpMenuEnvelope,
  mpMenuLayout,
} from "./shared";

/**
 * 公众号自定义菜单扩展事件（事实库 §2.3 九种 + §5.8–§5.10 官方样本，逐字）：
 * 菜单页 CLICK 与基础事件同一形态（事实库 §2.3「本页重申」），共用 wm-click；
 * 其余八种形态独立——scancode_push / scancode_waitmsg（黄金样本 §5.8 逐字）、
 * pic_sysphoto（§5.9 逐字）/ pic_photo_or_album / pic_weixin（官方注明同构）、
 * location_select（§5.10：嵌套全套 CDATA，Label 首尾空格逐字）、
 * VIEW 带 MenuId（§2.3 口径，比接收事件页多 MenuId）、view_miniprogram。
 * 官方注明第 3–8 个事件仅微信 iPhone 5.4.1+/Android 5.4+ 支持。
 */

/** 官方黄金样本 §5.8：ScanCodeInfo 嵌套原文片段（未知元素按原文透传） */
const SCAN_CODE_INFO_RESULT_1 = [
  "<ScanCodeInfo><ScanType><![CDATA[qrcode]]></ScanType>",
  "<ScanResult><![CDATA[1]]></ScanResult>",
  "</ScanCodeInfo>",
].join("\n");

/** scancode_waitmsg 官方样本同构：CreateTime=1408090606、ScanResult=2 */
const SCAN_CODE_INFO_RESULT_2 = [
  "<ScanCodeInfo><ScanType><![CDATA[qrcode]]></ScanType>",
  "<ScanResult><![CDATA[2]]></ScanResult>",
  "</ScanCodeInfo>",
].join("\n");

/** 官方黄金样本 §5.9：SendPicsInfo 嵌套原文片段（Count 裸文本 + PicMd5Sum） */
const SEND_PICS_INFO = [
  "<SendPicsInfo><Count>1</Count>",
  "<PicList><item><PicMd5Sum><![CDATA[1b5f7c23b5bf75682a53e7b6d163e185]]></PicMd5Sum>",
  "</item>",
  "</PicList>",
  "</SendPicsInfo>",
].join("\n");

/** 官方 §5.10：SendLocationInfo 全套 CDATA（Label 首尾空格逐字，Poiname 空） */
const SEND_LOCATION_INFO =
  "<SendLocationInfo><Location_X><![CDATA[23]]></Location_X><Location_Y><![CDATA[113]]></Location_Y><Scale><![CDATA[15]]></Scale><Label><![CDATA[ 广州市海珠区客村艺苑路 106号]]></Label><Poiname><![CDATA[]]></Poiname></SendLocationInfo>";

export const MP_MENU_EVENT_SCHEMAS = [
  defineSchema(MP_DEFINITIONS, "wm-scancode-push", {
    eventName: "scancode_push",
    name: "扫码推事件",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpMenuLayout,
    idGenerations: mpEventIdGenerations(),
    // 官方黄金样本 §5.8（逐字）
    payload: mpMenuEnvelope("scancode_push", "1408090502", {
      ScanCodeInfo: SCAN_CODE_INFO_RESULT_1,
    }),
  }),
  defineSchema(MP_DEFINITIONS, "wm-scancode-waitmsg", {
    eventName: "scancode_waitmsg",
    name: "扫码推事件且弹提示框",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpMenuLayout,
    idGenerations: mpEventIdGenerations(),
    // 官方黄金样本 §5.8 同构（CreateTime=1408090606、ScanResult=2）
    payload: mpMenuEnvelope("scancode_waitmsg", "1408090606", {
      ScanCodeInfo: SCAN_CODE_INFO_RESULT_2,
    }),
  }),
  defineSchema(MP_DEFINITIONS, "wm-pic-sysphoto", {
    eventName: "pic_sysphoto",
    name: "弹出系统拍照发图",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpMenuLayout,
    idGenerations: mpEventIdGenerations(),
    // 官方黄金样本 §5.9（逐字）
    payload: mpMenuEnvelope("pic_sysphoto", "1408090651", {
      SendPicsInfo: SEND_PICS_INFO,
    }),
  }),
  defineSchema(MP_DEFINITIONS, "wm-pic-photo-or-album", {
    eventName: "pic_photo_or_album",
    name: "弹出拍照或相册发图",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpMenuLayout,
    idGenerations: mpEventIdGenerations(),
    // 官方注明与 pic_sysphoto 同构（§2.3），形态按 §5.9 样本构造
    payload: mpMenuEnvelope("pic_photo_or_album", "1408090651", {
      SendPicsInfo: SEND_PICS_INFO,
    }),
  }),
  defineSchema(MP_DEFINITIONS, "wm-pic-weixin", {
    eventName: "pic_weixin",
    name: "弹出微信相册发图器",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpMenuLayout,
    idGenerations: mpEventIdGenerations(),
    // 官方注明与 pic_sysphoto 同构（§2.3），形态按 §5.9 样本构造
    payload: mpMenuEnvelope("pic_weixin", "1408090651", {
      SendPicsInfo: SEND_PICS_INFO,
    }),
  }),
  defineSchema(MP_DEFINITIONS, "wm-location-select", {
    eventName: "location_select",
    name: "弹出地理位置选择器",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpMenuLayout,
    idGenerations: mpEventIdGenerations(),
    payload: mpMenuEnvelope("location_select", "1408090651", {
      SendLocationInfo: SEND_LOCATION_INFO,
    }),
  }),
  defineSchema(MP_DEFINITIONS, "wm-view-menu", {
    eventName: "VIEW",
    name: "点击菜单跳转链接（个性化菜单）",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpMenuLayout,
    idGenerations: mpEventIdGenerations(),
    // 菜单页 VIEW 比接收事件页样本多 MenuId（事实库 §2.3）
    payload: mpMenuEnvelope("VIEW", "1408090651", {
      EventKey: "www.qq.com",
      MenuId: "MENUID",
    }),
  }),
  defineSchema(MP_DEFINITIONS, "wm-view-miniprogram", {
    eventName: "view_miniprogram",
    name: "点击菜单跳转小程序",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpMenuLayout,
    idGenerations: mpEventIdGenerations(),
    // §5.10：EventKey=小程序路径 + MenuId
    payload: mpMenuEnvelope("view_miniprogram", "1408090651", {
      EventKey: "pages/index/index",
      MenuId: "MENUID",
    }),
  }),
] as const;
