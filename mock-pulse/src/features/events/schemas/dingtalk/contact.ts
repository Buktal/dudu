import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  DINGTALK_DEFINITIONS,
  DINGTALK_ENCRYPTED_EXPECTED,
  dingtalkEnvelopeIdGenerations,
  dingtalkHttpEnvelope,
} from "./shared";

/**
 * 钉钉通讯录双事件（事实库 §5.2/§5.3 HTTP 信封全文，逐字）：
 * user_modify_org（用户更改，diffInfo.prev/curr 差异 + 字符串型 timeStamp）
 * 与 user_leave_org（用户离职）。双信封事件取 HTTP 子形态（大写系EventType
 * + 业务字段平铺）；不计入 Webhook 用量（事实库 §3.5）。
 */

/** 官方黄金样本 §5.2：user_modify_org HTTP 信封业务字段（逐字） */
const goldenUserModify: WirePayload = {
  timeStamp: "1608017258073",
  diffInfo: {
    prev: {
      managerUserid: "205xxx91",
      hiredDate: "20xx-xx-xx",
      name: "测试01",
      telephone: "1234",
      email: "xxx@xx.com",
      jobNumber: "112x422",
      workPlace: "北京",
    },
    curr: {
      managerUserid: "205xxx91",
      hiredDate: "20xx-xx-xx",
      name: "测试1",
      email: "xxx@xx.com",
      jobNumber: "112x422",
      workPlace: "北京",
    },
    userid: "user123456",
  },
  userId: ["user123456"],
};

/** 官方黄金样本 §5.3：user_leave_org HTTP 信封业务字段（逐字） */
const goldenUserLeave: WirePayload = {
  timeStamp: "1685501863357",
  userId: ["015xxxx227"],
};

export const DINGTALK_CONTACT_SCHEMAS = [
  defineSchema(DINGTALK_DEFINITIONS, "dt-user-modify-org", {
    eventName: "user_modify_org",
    name: "通讯录用户更改",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: DINGTALK_ENCRYPTED_EXPECTED,
    idGenerations: [
      ...dingtalkEnvelopeIdGenerations(),
      // 事实库 §5.2：timeStamp 为字符串型毫秒（与 EventTime 数字型并存）
      { path: "timeStamp", kind: "createTimeMsString" },
    ],
    payload: dingtalkHttpEnvelope("user_modify_org", goldenUserModify),
  }),
  defineSchema(DINGTALK_DEFINITIONS, "dt-user-leave-org", {
    eventName: "user_leave_org",
    name: "通讯录用户离职",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: DINGTALK_ENCRYPTED_EXPECTED,
    idGenerations: [
      ...dingtalkEnvelopeIdGenerations(),
      { path: "timeStamp", kind: "createTimeMsString" },
    ],
    payload: dingtalkHttpEnvelope("user_leave_org", goldenUserLeave),
  }),
] as const;
