import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  MP_DEFINITIONS,
  MP_EXPECTED,
  mpEventEnvelope,
  mpEventIdGenerations,
  mpEventLayout,
} from "./shared";

/**
 * 公众号基础事件（事实库 §2.2 六种 + §5.5–§5.7 官方样本，逐字）：
 * subscribe / unsubscribe / SCAN / LOCATION / CLICK / VIEW。
 * subscribe/unsubscribe/LOCATION 逐字复刻官方黄金样本（§5.5 FromUserName
 * 占位 FromUser 的大小写原文如此）；SCAN/CLICK/VIEW 官方无整包样本，
 * 按 §5.5/§5.7 字段口径构造（SCAN 带 EventKey+Ticket，VIEW 不带 MenuId）。
 */

/** 官方黄金样本 §5.5：subscribe 事件（逐字） */
const goldenMpSubscribe: WirePayload = {
  ToUserName: "toUser",
  FromUserName: "FromUser",
  CreateTime: "123456789",
  MsgType: "event",
  Event: "subscribe",
};

export const MP_BASIC_EVENT_SCHEMAS = [
  defineSchema(MP_DEFINITIONS, "wm-subscribe", {
    eventName: "subscribe",
    name: "关注公众号",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpEventLayout,
    idGenerations: mpEventIdGenerations(),
    payload: goldenMpSubscribe,
  }),
  defineSchema(MP_DEFINITIONS, "wm-unsubscribe", {
    eventName: "unsubscribe",
    name: "取消关注",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpEventLayout,
    idGenerations: mpEventIdGenerations(),
    payload: { ...goldenMpSubscribe, Event: "unsubscribe" },
  }),
  defineSchema(MP_DEFINITIONS, "wm-scan", {
    eventName: "SCAN",
    name: "已关注扫带参码",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpEventLayout,
    idGenerations: mpEventIdGenerations(),
    // §5.5 口径：EventKey=场景值 ID（无 qrscene_ 前缀）+ Ticket
    payload: mpEventEnvelope("SCAN", {
      EventKey: "SCENE_VALUE",
      Ticket: "TICKET",
    }),
  }),
  defineSchema(MP_DEFINITIONS, "wm-location-report", {
    eventName: "LOCATION",
    name: "上报地理位置",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpEventLayout,
    idGenerations: mpEventIdGenerations(),
    // 官方黄金样本 §5.6（逐字；坐标数值为裸文本）
    payload: mpEventEnvelope("LOCATION", {
      FromUserName: "fromUser",
      Latitude: "23.137466",
      Longitude: "113.352425",
      Precision: "119.385040",
    }),
  }),
  defineSchema(MP_DEFINITIONS, "wm-click", {
    eventName: "CLICK",
    name: "点击菜单拉取消息",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpEventLayout,
    idGenerations: mpEventIdGenerations(),
    // §5.7：EventKey=菜单 key；点开子菜单不产生上报
    payload: mpEventEnvelope("CLICK", { EventKey: "EVENTKEY" }),
  }),
  defineSchema(MP_DEFINITIONS, "wm-view", {
    eventName: "VIEW",
    name: "点击菜单跳转链接",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpEventLayout,
    idGenerations: mpEventIdGenerations(),
    // §5.7：EventKey=跳转 URL（接收事件页样本无 MenuId；菜单页见 wm-view-menu）
    payload: mpEventEnvelope("VIEW", { EventKey: "www.qq.com" }),
  }),
] as const;
