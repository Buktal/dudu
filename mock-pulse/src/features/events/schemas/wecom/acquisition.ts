import { defineSchema } from "../define";
import {
  WECOM_DEFINITIONS,
  WECOM_EXPECTED,
  wcCdataEventLayout,
  wcEventIdGenerations,
  wcSysEnvelope,
} from "./shared";

/**
 * 企微事件字典 · 获客助手（事实库 §2.9，97299）：
 * Event=customer_acquisition，FromUserName=sys。变更类型 11 种，其中仅
 * friend_request 带字段明细（LinkId+State），默认按它构造、其余在表单
 * 直接改 ChangeType；其他变更类型的字段官方未收录，经完整报文页增补。
 */
export const WECOM_AGENT_ACQUISITION_EVENT_SCHEMAS = [
  defineSchema(WECOM_DEFINITIONS, "wc-customer-acquisition", {
    eventName: "customer_acquisition",
    name: "获客助手 · 事件通知",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcCdataEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("customer_acquisition", "friend_request", {
      LinkId: "LINKID",
      State: "teststate",
    }),
  }),
] as const;
