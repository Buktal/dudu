import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import { BILI_DEFINITIONS, BILI_EXPECTED, biliEnvelope } from "./shared";

/**
 * Webhooks 封闭 4 事件（事实库 §2.2 事件表 + §5.2–§5.5 示例载荷）：授权
 * authorize / 解除授权 deauthorize / 稿件开放浏览 video_open / 投稿失败
 * video_fail。deauthorize 一条有官方原文印证（事件页 + 字段表逐字），其余
 * 三条出自镜像（待核验(09-27)，事件正文按事实库当前口径、只收样本实锤字段
 * 骨架从简）。示例 openid 尾部空格为官方样本原文照录（§5.2–§5.5 四条一致），
 * 新建事件即按 ID 规则重生成；timestamp 官方示例 2021-01-01 12:01:01 为
 * 占位、新建事件按 UTC+8 当前时刻重生成。
 */

/** §5.2/§5.3/§5.4/§5.5 四条示例共用的官方占位值（逐字，openid 尾部空格原文如此） */
const GOLDEN_OPENID = "9205eeaa1879skxys969ed47874f225c3 ";
const GOLDEN_CLIENT_ID = "395c8275dd674f17";

/** 授权/解除授权 content 同构字段族（官方 deauthorize 字段表 openid/client_id/permits） */
const authContent = (permits: string): WirePayload => ({
  openid: GOLDEN_OPENID,
  client_id: GOLDEN_CLIENT_ID,
  permits,
});

/** 稿件事件 content 字段族（镜像示例 openid/client_id/resource_id/state/state_desc） */
const videoContent = (state: number, stateDesc: string): WirePayload => ({
  openid: GOLDEN_OPENID,
  client_id: GOLDEN_CLIENT_ID,
  resource_id: "BV1S9L90H082",
  state,
  state_desc: stateDesc,
});

const biliIdGenerations = (extra: { path: string; kind: "biliBvId" }[]) => [
  { path: "content.openid", kind: "biliOpenId" as const },
  { path: "content.client_id", kind: "biliClientId" as const },
  ...extra,
  { path: "timestamp", kind: "biliTimestamp" as const },
];

export const BILI_EVENT_SCHEMAS = [
  defineSchema(BILI_DEFINITIONS, "bili-authorize", {
    eventName: "authorize",
    name: "用户授权（authorize）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: BILI_EXPECTED,
    idGenerations: biliIdGenerations([]),
    payload: biliEnvelope("authorize", authContent("USER_INFO, USER_DATA")),
  }),
  defineSchema(BILI_DEFINITIONS, "bili-deauthorize", {
    eventName: "deauthorize",
    name: "解除授权（deauthorize，含注销广播）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: BILI_EXPECTED,
    idGenerations: biliIdGenerations([]),
    payload: biliEnvelope("deauthorize", authContent("ATC_DATA, ATC_BASE")),
  }),
  defineSchema(BILI_DEFINITIONS, "bili-video-open", {
    eventName: "video_open",
    name: "稿件开放浏览（video_open）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: BILI_EXPECTED,
    idGenerations: biliIdGenerations([
      { path: "content.resource_id", kind: "biliBvId" },
    ]),
    payload: biliEnvelope("video_open", videoContent(0, "开放浏览")),
  }),
  defineSchema(BILI_DEFINITIONS, "bili-video-fail", {
    eventName: "video_fail",
    name: "投稿失败（video_fail）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: BILI_EXPECTED,
    idGenerations: biliIdGenerations([
      { path: "content.resource_id", kind: "biliBvId" },
    ]),
    payload: biliEnvelope("video_fail", videoContent(-2, "已退回")),
  }),
] as const;
