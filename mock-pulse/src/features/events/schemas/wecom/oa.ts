import { defineSchema } from "../define";
import type { XmlLayout } from "../types";
import {
  WECOM_DEFINITIONS,
  WECOM_EXPECTED,
  wcEventEnvelope,
  wcEventIdGenerations,
} from "./shared";

/**
 * 企微事件字典 · OA 审批（事实库 §2.7，91815）：
 * Event=sys_approval_change（OA 审批应用，区别于流程引擎的 open_approval_change）。
 * 载荷取 §2.7 标量字段（SpNo/SpNoStr/SpName/SpStatus/StatuChangeEvent）；
 * SpRecord/SpComment/NotificationMap 官方未收录内部明细，不编造，
 * 可在完整报文页增补。状态变化覆盖催办/撤销/同意/驳回/转审/添加备注等。
 */

/** 审批事件排版：审批单号与状态为数值，裸文本输出 */
const wcApprovalLayout: XmlLayout = {
  indent: "\t",
  bareTags: ["CreateTime", "SpNo", "SpStatus", "AgentID"],
};

export const WECOM_AGENT_OA_EVENT_SCHEMAS = [
  defineSchema(WECOM_DEFINITIONS, "wc-sys-approval-change", {
    eventName: "sys_approval_change",
    name: "OA 审批 · 申请状态变化",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcApprovalLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcEventEnvelope("sys_approval_change", {
      SpNo: "201904270001",
      SpNoStr: "201904270001",
      SpName: "请假审批",
      SpStatus: "1",
      StatuChangeEvent: "1",
    }),
  }),
] as const;
