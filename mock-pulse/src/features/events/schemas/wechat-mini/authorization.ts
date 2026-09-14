import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  MINI_DEFINITIONS,
  MINI_EXPECTED,
  miniEventIdGenerations,
  miniEventLayout,
} from "./shared";

/**
 * 小程序授权用户信息变更事件（事实库 §2.4 + §5.7 官方样本）：
 * user_info_modified / user_authorization_revoke / user_authorization_cancellation。
 * revoke 为 XML 黄金样本逐字（含 RevokeInfo 枚举与 PluginID/OpenPID 插件
 * 场景字段）；其余两事件官方仅给 Event 枚举与信封字段表、无整包样本，按
 * 同一信封字段表构造（共用 ToUserName/FromUserName/CreateTime/MsgType/
 * Event/OpenID/AppID，身份取 §5.7 样本值，不编造字段）。
 * 回执语义（事实库 §2.4）：回 success 或空字符串（无需加密）。
 */

/** §5.7 官方样本身份（逐字） */
const AUTH_TO_USER = "gh_870882ca4b1";
const AUTH_FROM_USER = "owAqB1v0ahK_Xlc7GshIDdf2yf7E";
const AUTH_OPEN_ID = "owAqB1nqaOYYWl0Ng484G2z5NIwU";
const AUTH_APP_ID = "wx13974bf780d3dc89";

/** 授权变更事件信封：§5.7 样本身份 + 信封字段表公共字段（官方 revoke 样本 CreateTime） */
function miniAuthorizationEnvelope(event: string): WirePayload {
  return {
    ToUserName: AUTH_TO_USER,
    FromUserName: AUTH_FROM_USER,
    CreateTime: "1626857200",
    MsgType: "event",
    Event: event,
    OpenID: AUTH_OPEN_ID,
    AppID: AUTH_APP_ID,
  };
}

/** 官方黄金样本 §5.7：user_authorization_revoke（XML 逐字） */
const goldenMiniAuthRevoke: WirePayload = {
  ToUserName: AUTH_TO_USER,
  FromUserName: AUTH_FROM_USER,
  CreateTime: "1626857200",
  MsgType: "event",
  Event: "user_authorization_revoke",
  OpenID: AUTH_OPEN_ID,
  AppID: AUTH_APP_ID,
  RevokeInfo: "1",
  PluginID: "wx13974bf780d3dc89",
  OpenPID: "G7esq5NVzP76HIHoB95t4CVBP6to",
};

export const MINI_AUTHORIZATION_EVENT_SCHEMAS = [
  defineSchema(MINI_DEFINITIONS, "wmn-user-info-modified", {
    eventName: "user_info_modified",
    name: "授权用户资料变更",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MINI_EXPECTED,
    xmlLayout: miniEventLayout,
    idGenerations: miniEventIdGenerations(),
    // 信封字段表构造（官方无整包样本）
    payload: miniAuthorizationEnvelope("user_info_modified"),
  }),
  defineSchema(MINI_DEFINITIONS, "wmn-auth-revoke", {
    eventName: "user_authorization_revoke",
    name: "授权用户撤回授权",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MINI_EXPECTED,
    xmlLayout: miniEventLayout,
    idGenerations: miniEventIdGenerations(),
    payload: goldenMiniAuthRevoke,
  }),
  defineSchema(MINI_DEFINITIONS, "wmn-auth-cancellation", {
    eventName: "user_authorization_cancellation",
    name: "授权用户注销",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MINI_EXPECTED,
    xmlLayout: miniEventLayout,
    idGenerations: miniEventIdGenerations(),
    // 信封字段表构造（官方无整包样本）
    payload: miniAuthorizationEnvelope("user_authorization_cancellation"),
  }),
] as const;
