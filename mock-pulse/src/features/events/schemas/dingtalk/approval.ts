import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  DINGTALK_DEFINITIONS,
  DINGTALK_ENCRYPTED_EXPECTED,
  dingtalkEnvelopeIdGenerations,
  dingtalkHttpEnvelope,
} from "./shared";

/**
 * 钉钉审批双事件（事实库 §5.4 + §2.2 订阅规则，逐字）：审批实例
 * bpms_instance_change（type start/finish/terminate）与审批任务
 * bpms_task_change（type start/finish + result:redirect 转交、cancel 或签）。
 * 取新 HTTP 密文信封的明文形态（大写系 EventType + 业务字段平铺）。
 */

/** 官方黄金样本 §5.4：bpms_instance_change HTTP 信封业务字段（逐字） */
const goldenBpmsInstance: WirePayload = {
  result: "agree",
  processInstanceId: "9Qgx5QqjR7axMwxxxx",
  finishTime: 1495592272000,
  createTime: 1495592305000,
  processCode: "Pro-xxx",
  bizCategoryId: "20230xxx",
  businessId: "yewu1",
  type: "finish",
  title: "自测-1016",
  businessType: "yewu1",
  // 官方样本中 = 与 & 以 =/& 转义传输，此处按解码等值照录
  url: "https://aflow.dingtalk.com/dingtalk/mobile/homepage.htm?corpid=ding2c015874d817xxxx&dd_share=",
  staffId: "manager75",
};

/** 官方黄金样本 §5.4：bpms_task_change HTTP 信封业务字段（逐字） */
const goldenBpmsTask: WirePayload = {
  result: "agree",
  processInstanceId: "ce133dd0-5b22-9516-xxxxxxxxxxxx",
  finishTime: 1670983893000,
  createTime: 1670983873000,
  processCode: "PROC-27BBC5E6-DFFA-4EC3-A1F1-xxx",
  bizCategoryId: "attendance.goout",
  businessId: "20xxxx38",
  remark: "同意",
  type: "finish",
  title: "考勤-测试",
  taskId: 811165,
  staffId: "08058646137",
};

export const DINGTALK_APPROVAL_SCHEMAS = [
  defineSchema(DINGTALK_DEFINITIONS, "dt-bpms-instance-change", {
    eventName: "bpms_instance_change",
    name: "审批实例变更",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: DINGTALK_ENCRYPTED_EXPECTED,
    idGenerations: [
      ...dingtalkEnvelopeIdGenerations(),
      { path: "finishTime", kind: "createTimeMs" },
      { path: "createTime", kind: "createTimeMs" },
    ],
    payload: dingtalkHttpEnvelope("bpms_instance_change", goldenBpmsInstance),
  }),
  defineSchema(DINGTALK_DEFINITIONS, "dt-bpms-task-change", {
    eventName: "bpms_task_change",
    name: "审批任务变更",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: DINGTALK_ENCRYPTED_EXPECTED,
    idGenerations: [
      ...dingtalkEnvelopeIdGenerations(),
      { path: "finishTime", kind: "createTimeMs" },
      { path: "createTime", kind: "createTimeMs" },
    ],
    payload: dingtalkHttpEnvelope("bpms_task_change", goldenBpmsTask),
  }),
] as const;
