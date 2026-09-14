import { defineSchema } from "../define";
import {
  WECOM_DEFINITIONS,
  WECOM_EXPECTED,
  wcEventEnvelope,
  wcEventIdGenerations,
  wcEventLayout,
} from "./shared";

/**
 * 企微自建应用事件字典 · 应用活跃度（事实库 §2.2 事件目录）：
 * inactive_alert（EffectTime）/ close_inactive_agent / reopen_inactive_agent /
 * low_active_alert（EffectTime）/ low_active / active_restored。
 * 系统生成的事件 FromUserName 固定 sys（官方 §2.2 标注）。
 */

function sysEvent(event: string, extra: Record<string, string> = {}) {
  return { ...wcEventEnvelope(event, extra), FromUserName: "sys" };
}

export const WECOM_AGENT_LIFECYCLE_EVENT_SCHEMAS = [
  defineSchema(WECOM_DEFINITIONS, "wc-inactive-alert", {
    eventName: "inactive_alert",
    name: "长期未使用停用预警",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: sysEvent("inactive_alert", { EffectTime: "1609459200" }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-close-inactive-agent", {
    eventName: "close_inactive_agent",
    name: "长期未使用自动停用",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: sysEvent("close_inactive_agent"),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-reopen-inactive-agent", {
    eventName: "reopen_inactive_agent",
    name: "停用应用重新启用",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcEventEnvelope("reopen_inactive_agent"),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-low-active-alert", {
    eventName: "low_active_alert",
    name: "应用低活跃预警",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: sysEvent("low_active_alert", { EffectTime: "1609459200" }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-low-active", {
    eventName: "low_active",
    name: "应用变为低活跃",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: sysEvent("low_active"),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-active-restored", {
    eventName: "active_restored",
    name: "低活跃应用恢复活跃",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: sysEvent("active_restored"),
  }),
] as const;
