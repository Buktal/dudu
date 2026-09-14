import { defineSchema } from "../define";
import {
  WECOM_DEFINITIONS,
  WECOM_EXPECTED,
  wcEventEnvelope,
  wcEventIdGenerations,
  wcEventLayout,
} from "./shared";

/**
 * 企微自建应用事件字典 · 菜单跳转（事实库 §2.2 事件目录）：
 * click / view / view_miniprogram。EventKey 分别对应菜单 key / URL / 小程序路径。
 */

export const WECOM_AGENT_MENU_EVENT_SCHEMAS = [
  defineSchema(WECOM_DEFINITIONS, "wc-click", {
    eventName: "click",
    name: "点击菜单按钮",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcEventEnvelope("click", { EventKey: "EVENTKEY" }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-view", {
    eventName: "view",
    name: "点击菜单跳转链接",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcEventEnvelope("view", {
      EventKey: "https://work.weixin.qq.com",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-view-miniprogram", {
    eventName: "view_miniprogram",
    name: "点击菜单跳小程序",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcEventEnvelope("view_miniprogram", {
      EventKey: "pages/index/index.html",
    }),
  }),
] as const;
