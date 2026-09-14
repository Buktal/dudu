import { defineSchema } from "../define";
import {
  WECOM_DEFINITIONS,
  WECOM_EXPECTED,
  wcEventEnvelope,
  wcEventIdGenerations,
  wcEventLayout,
} from "./shared";

/**
 * 企微自建应用事件字典 · 审批/共享应用/模板卡片（事实库 §2.2 事件目录）：
 * open_approval_change（ApprovalInfo 结构体）/ share_agent_change /
 * share_chain_change（FromUserName=sys）/ template_card_event /
 * template_card_menu_event。ResponseCode 官方约束 72 小时内有效且仅一次。
 */

const APPROVAL_INFO =
  "<ApprovalInfo><SpNo><![CDATA[SP_NO]]></SpNo><SpStatus>1</SpStatus><StatuChangeEvent><![CDATA[1]]></StatuChangeEvent></ApprovalInfo>";

export const WECOM_AGENT_CARD_EVENT_SCHEMAS = [
  defineSchema(WECOM_DEFINITIONS, "wc-open-approval-change", {
    eventName: "open_approval_change",
    name: "审批状态变化",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcEventEnvelope("open_approval_change", {
      ApprovalInfo: APPROVAL_INFO,
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-share-agent-change", {
    eventName: "share_agent_change",
    name: "企业互联共享应用变更",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: {
      ...wcEventEnvelope("share_agent_change"),
      FromUserName: "sys",
    },
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-share-chain-change", {
    eventName: "share_chain_change",
    name: "上下游共享应用变更",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: {
      ...wcEventEnvelope("share_chain_change"),
      FromUserName: "sys",
    },
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-template-card-event", {
    eventName: "template_card_event",
    name: "点击模板卡片按钮",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcEventEnvelope("template_card_event", {
      EventKey: "btn:EVENTKEY",
      TaskId: "TASK_ID",
      CardType: "button_interaction",
      ResponseCode: "RESPONSE_CODE",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-template-card-menu-event", {
    eventName: "template_card_menu_event",
    name: "点击模板卡片右上角菜单",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcEventEnvelope("template_card_menu_event", {
      TaskId: "TASK_ID",
      CardType: "text_notice",
    }),
  }),
] as const;
