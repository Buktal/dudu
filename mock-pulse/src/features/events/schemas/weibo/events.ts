import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  WB_DEFINITIONS,
  WB_EXPECTED,
  wbEnvelope,
  wbIdGenerations,
} from "./shared";

/**
 * 微博事件推送八种（事实库 §2.2/§5.5–§5.10，type:"event" + data.subtype 判型）：
 * follow/unfollow（关注/取关）、subscribe/unsubscribe（订阅/退订）、
 * scan/scan_follow（扫带参二维码：已关注推 scan、未关注→关注推 scan_follow）、
 * click/view（自定义菜单 Click/View）。mention（被@）官方已暂停不收，不设模板。
 * 载荷逐字取自「接收事件推送」页官方样本；§5.7 扫码样本 ticket 行尾逗号系
 * 官方原文笔误，JSON 载荷按三键（subtype/key/ticket）承载，值逐字。
 */

/** 官方样本 §5.5：关注事件（unfollow 同构：subtype 换值、text 换默认文案） */
const GOLDEN_FOLLOW: WirePayload = wbEnvelope("event", "关注事件消息", {
  subtype: "follow",
});

/** unfollow 与 follow 同构（事实库 §5.5 原注），text 官方默认文案 */
const GOLDEN_UNFOLLOW: WirePayload = wbEnvelope("event", "取消关注事件消息", {
  subtype: "unfollow",
});

/** 官方样本 §5.6：订阅事件（text 为触发关键词或默认文案，模板取默认） */
const GOLDEN_SUBSCRIBE: WirePayload = wbEnvelope("event", "订阅事件消息", {
  subtype: "subscribe",
});

/** unsubscribe 与 subscribe 同构，text 官方默认文案 */
const GOLDEN_UNSUBSCRIBE: WirePayload = wbEnvelope(
  "event",
  "取消订阅事件消息",
  { subtype: "unsubscribe" },
);

/** 官方样本 §5.7：扫带参二维码（key = action_name 前缀 + scene_id、ticket 换图）；
 *  已关注推 scan（§2.2 分流规则，字段同构） */
const GOLDEN_SCAN: WirePayload = wbEnvelope("event", "扫描二维码", {
  subtype: "scan",
  key: "action_name_scene_id",
  ticket: "TICKET",
});

/** 官方样本 §5.7 逐字：未关注扫码 → 关注推 scan_follow */
const GOLDEN_SCAN_FOLLOW: WirePayload = wbEnvelope("event", "扫描二维码", {
  subtype: "scan_follow",
  key: "action_name_scene_id",
  ticket: "TICKET",
});

/** 官方样本 §5.9：菜单 Click 型（key = 菜单 EVENT_KEY） */
const GOLDEN_CLICK: WirePayload = wbEnvelope(
  "event",
  "自定义菜单点击事件消息",
  { subtype: "click", key: "EVENT_KEY" },
);

/** 官方样本 §5.10：菜单 View 跳转链接型（key = 按钮 URL） */
const GOLDEN_VIEW: WirePayload = wbEnvelope(
  "event",
  "自定义菜单跳转链接事件消息",
  { subtype: "view", key: "url" },
);

export const WB_EVENT_SCHEMAS = [
  defineSchema(WB_DEFINITIONS, "weibo-follow", {
    eventName: "follow",
    name: "关注事件",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WB_EXPECTED,
    idGenerations: wbIdGenerations(),
    payload: GOLDEN_FOLLOW,
  }),
  defineSchema(WB_DEFINITIONS, "weibo-unfollow", {
    eventName: "unfollow",
    name: "取消关注事件",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WB_EXPECTED,
    idGenerations: wbIdGenerations(),
    payload: GOLDEN_UNFOLLOW,
  }),
  defineSchema(WB_DEFINITIONS, "weibo-subscribe", {
    eventName: "subscribe",
    name: "订阅事件",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WB_EXPECTED,
    idGenerations: wbIdGenerations(),
    payload: GOLDEN_SUBSCRIBE,
  }),
  defineSchema(WB_DEFINITIONS, "weibo-unsubscribe", {
    eventName: "unsubscribe",
    name: "取消订阅事件",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WB_EXPECTED,
    idGenerations: wbIdGenerations(),
    payload: GOLDEN_UNSUBSCRIBE,
  }),
  defineSchema(WB_DEFINITIONS, "weibo-scan", {
    eventName: "scan",
    name: "扫带参二维码（已关注）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WB_EXPECTED,
    idGenerations: wbIdGenerations(),
    payload: GOLDEN_SCAN,
  }),
  defineSchema(WB_DEFINITIONS, "weibo-scan-follow", {
    eventName: "scan_follow",
    name: "扫带参二维码（未关注→关注）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WB_EXPECTED,
    idGenerations: wbIdGenerations(),
    payload: GOLDEN_SCAN_FOLLOW,
  }),
  defineSchema(WB_DEFINITIONS, "weibo-click", {
    eventName: "click",
    name: "自定义菜单点击",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WB_EXPECTED,
    idGenerations: wbIdGenerations(),
    payload: GOLDEN_CLICK,
  }),
  defineSchema(WB_DEFINITIONS, "weibo-view", {
    eventName: "view",
    name: "自定义菜单跳转链接",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: WB_EXPECTED,
    idGenerations: wbIdGenerations(),
    payload: GOLDEN_VIEW,
  }),
] as const;
