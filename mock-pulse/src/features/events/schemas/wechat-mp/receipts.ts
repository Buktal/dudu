import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  MP_DEFINITIONS,
  MP_EXPECTED,
  mpEventIdGenerations,
  mpReceiptEnvelope,
  mpReceiptLayout,
} from "./shared";

/**
 * 公众号结果回执与订阅通知事件（事实库 §2.4/§2.5 + §5.11/§5.12 官方样本）：
 * - TEMPLATESENDJOBFINISH（§5.11 黄金样本逐字，Status 三态见字段说明）
 * - MASSSENDJOBFINISH（§2.4 字段口径构造：FromUserName=mphelper + 四计数，
 *   官方无整包样本；Status 映射 err(num) 见字段说明）
 * - 订阅通知三事件（§5.12：嵌套 List 结构按原文片段透传，ToUserName/
 *   FromUserName 取官方样本值）
 */

/** 官方黄金样本 §5.11：模板消息发送结果回执（逐字，成功态） */
const goldenMpTemplateSendJobFinish: WirePayload = {
  ToUserName: "gh_7f083739789a",
  FromUserName: "oia2TjuEGTNoeX76QEjQNrcURxG8",
  CreateTime: "1395658920",
  MsgType: "event",
  Event: "TEMPLATESENDJOBFINISH",
  MsgID: "200163836",
  Status: "success",
};

/** 订阅通知三事件的官方样本身份（§5.12 逐字） */
const SUBSCRIPTION_TO_USER = "gh_123456789abc";
const SUBSCRIPTION_FROM_USER = "otFpruAK8D-E6EfStSYonYSBZ8_4";

/** 订阅通知嵌套 List 原文片段（结构按 §5.12 口径，逐字段官方样本值） */
const SUBSCRIBE_MSG_POPUP_EVENT = [
  "<SubscribeMsgPopupEvent>",
  "\t<List>",
  "\t\t<TemplateId><![CDATA[TEMPLATEID]]></TemplateId>",
  "\t\t<SubscribeStatusString><![CDATA[accept]]></SubscribeStatusString>",
  "\t\t<PopupScene>2</PopupScene>",
  "\t</List>",
  "</SubscribeMsgPopupEvent>",
].join("\n");

const SUBSCRIBE_MSG_CHANGE_EVENT = [
  "<SubscribeMsgChangeEvent>",
  "\t<List>",
  "\t\t<TemplateId><![CDATA[TEMPLATEID]]></TemplateId>",
  "\t\t<SubscribeStatusString><![CDATA[reject]]></SubscribeStatusString>",
  "\t</List>",
  "</SubscribeMsgChangeEvent>",
].join("\n");

const SUBSCRIBE_MSG_SENT_EVENT = [
  "<SubscribeMsgSentEvent>",
  "\t<List>",
  "\t\t<TemplateId><![CDATA[TEMPLATEID]]></TemplateId>",
  "\t\t<MsgID>1700827132819554304</MsgID>",
  "\t\t<ErrorCode>0</ErrorCode>",
  "\t\t<ErrorStatus><![CDATA[success]]></ErrorStatus>",
  "\t</List>",
  "</SubscribeMsgSentEvent>",
].join("\n");

/** 订阅通知事件信封：官方样本身份 + 嵌套 List 原文片段殿后 */
function mpSubscriptionEnvelope(
  event: string,
  nestedTag: string,
  nested: string,
): WirePayload {
  return {
    ToUserName: SUBSCRIPTION_TO_USER,
    FromUserName: SUBSCRIPTION_FROM_USER,
    CreateTime: "123456789",
    MsgType: "event",
    Event: event,
    [nestedTag]: nested,
  };
}

export const MP_RECEIPT_EVENT_SCHEMAS = [
  defineSchema(MP_DEFINITIONS, "wm-template-send-job-finish", {
    eventName: "TEMPLATESENDJOBFINISH",
    name: "模板消息发送结果",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpReceiptLayout,
    idGenerations: mpEventIdGenerations(),
    payload: goldenMpTemplateSendJobFinish,
  }),
  defineSchema(MP_DEFINITIONS, "wm-masssend-job-finish", {
    eventName: "MASSSENDJOBFINISH",
    name: "群发消息发送结果",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpReceiptLayout,
    idGenerations: mpEventIdGenerations(),
    // §2.4 字段口径构造（官方无整包样本）：FromUserName 固定 mphelper
    payload: mpReceiptEnvelope("MASSSENDJOBFINISH", {
      FromUserName: "mphelper",
      MsgID: "1000000001",
      Status: "send success",
      TotalCount: "100",
      FilterCount: "80",
      SentCount: "80",
      ErrorCount: "20",
    }),
  }),
  defineSchema(MP_DEFINITIONS, "wm-subscribe-msg-popup", {
    eventName: "subscribe_msg_popup_event",
    name: "订阅通知弹窗操作",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpReceiptLayout,
    idGenerations: mpEventIdGenerations(),
    payload: mpSubscriptionEnvelope(
      "subscribe_msg_popup_event",
      "SubscribeMsgPopupEvent",
      SUBSCRIBE_MSG_POPUP_EVENT,
    ),
  }),
  defineSchema(MP_DEFINITIONS, "wm-subscribe-msg-change", {
    eventName: "subscribe_msg_change_event",
    name: "订阅通知状态变更",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpReceiptLayout,
    idGenerations: mpEventIdGenerations(),
    payload: mpSubscriptionEnvelope(
      "subscribe_msg_change_event",
      "SubscribeMsgChangeEvent",
      SUBSCRIBE_MSG_CHANGE_EVENT,
    ),
  }),
  defineSchema(MP_DEFINITIONS, "wm-subscribe-msg-sent", {
    eventName: "subscribe_msg_sent_event",
    name: "订阅通知下发结果",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: MP_EXPECTED,
    xmlLayout: mpReceiptLayout,
    idGenerations: mpEventIdGenerations(),
    payload: mpSubscriptionEnvelope(
      "subscribe_msg_sent_event",
      "SubscribeMsgSentEvent",
      SUBSCRIBE_MSG_SENT_EVENT,
    ),
  }),
] as const;
