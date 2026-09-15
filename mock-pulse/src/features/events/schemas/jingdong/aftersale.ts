import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import { JD_DEFINITIONS, JD_EXPECTED } from "./shared";

/**
 * 售后全流程消息（事实库 §2.2 消息名实锤）：AFS_StepResult_JOS——官方原话
 * 「售后服务单全流程消息通知：AFS_StepResult_JOS」，并引导优先用消息
 * （轮询 jingdong.asc.sync.list 计划 2026-09 下线，消息名实锤旁证）。
 * 载荷字段与订阅方式 → 待核验(09-27)（仅消息名实锤），骨架从简：只收
 * serviceId（服务单号，售后业务主单据号——§5.3 push2 参数表官方词汇）。
 */

/** 售后推送骨架（官方实锤词汇单字段；样本值取官方数字串单号形态） */
const GOLDEN_AFS_STEP_RESULT: WirePayload = {
  serviceId: "1001",
};

export const JD_AFS_SCHEMAS = [
  defineSchema(JD_DEFINITIONS, "jd-afs-step-result", {
    eventName: "AFS_StepResult_JOS",
    name: "售后全流程消息（AFS_StepResult_JOS）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: JD_EXPECTED,
    idGenerations: [{ path: "serviceId", kind: "jdBizId" }],
    payload: GOLDEN_AFS_STEP_RESULT,
  }),
] as const;
