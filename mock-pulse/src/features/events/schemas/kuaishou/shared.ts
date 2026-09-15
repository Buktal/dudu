import openDefinitions from "../../definitions/kuaishou/kuaishou-open.json";
import payDefinitions from "../../definitions/kuaishou/kuaishou-pay.json";
import {
  mergeChannelDefinitions,
  parseChannelDefinition,
} from "../../definitions/loader";
import type { ExpectedReceipt, IdGeneration, WirePayload } from "../types";

/**
 * 快手渠道协议元数据公共体（事实库 docs/research/channels/kuaishou.md，
 * 双域并行共用同一传输：明文 JSON + header kwaisign，无 AES）：
 * - 开放平台 WebHook（§2.1）：信封 `event` 判型，五字段
 *   {app_id, event, timestamp, message_id, data}（accessGuide 自称"四个"实列
 *   五个，原文如此）；全目录穷尽仅 3 事件（官方文档站 bundle 路由枚举实锤）
 * - 小程序支付回调族（§2.2/§4.1）：信封 `biz_type` 判型（无 event 字段），
 *   toSignStr 键序 data/biz_type/message_id/app_id/timestamp（官方验证示例逐字）
 * - 验签（§4.1）：kwaisign = MD5(原始 body 字符串 + app_secret)，签名放 http
 *   header `kwaisign`——由 Rust 适配器完成（原始字节口径，模板只持明文）
 * - 应答（§3.2 七页逐字一致）：HTTP 200 + {"result":1,"message_id":"<收到的
 *   消息 ID>"}，result=1 之外一律失败并按重试表重推（支付族最长 16 次）
 * 字段说明与版本/来源由 definitions/kuaishou/ 分域描述文件装载即校验后合并。
 */

/** 版本化字段描述文件：按域分两份，装载即校验（坏文件启动即炸）后合并 */
export const KS_DEFINITIONS = mergeChannelDefinitions(
  [openDefinitions, payDefinitions].map((part) => parseChannelDefinition(part)),
);

/**
 * 官方成功应答（§3.2）：HTTP 200 且 result=1 代表成功，其他代表失败并重试。
 * 应答体 {"result":1,"message_id":"<收到的消息 ID>"} 中 message_id 为请求侧
 * 幂等键回传，期望按 JSON 字段子集声明（回传字段允许存在）。
 */
export const KS_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: '{"result":1}',
  bodyMode: "jsonField",
};

/** 官方验证示例的 AppID（§4.1 逐字：ks696650570360602063） */
export const KS_APP_ID = "ks696650570360602063";

/** 官方支付回调样本的 message_id（§4.1 逐字，UUID 形态） */
export const KS_PAY_MESSAGE_ID = "76a50e0c-a843-492b-9bc6-463c1b178a9c";

/** §3.2 七页逐字一致的应答 message_id 样本（开放域信封占位，protobuf 串形态） */
export const KS_WEBHOOK_MESSAGE_ID =
  "ChFvYXV0aC5hY2Nlc3NUb2tlbhJQvpR51x8In46B1sDB";

/** §3.1 测试事件的 data 时间戳（官方样本逐字） */
export const KS_OPEN_TIMESTAMP = 1622518497536;

/** 官方验证示例的回调时刻（§4.1 逐字） */
export const KS_PAY_TIMESTAMP = 1631515320564;

/**
 * 开放域信封骨架（§2.1 事件页信封五字段键序）：app_id/event/timestamp/
 * message_id/data，data 由调用方覆写。
 */
export function ksOpenEnvelope(event: string, data: WirePayload): WirePayload {
  return {
    app_id: KS_APP_ID,
    event,
    timestamp: KS_OPEN_TIMESTAMP,
    message_id: KS_WEBHOOK_MESSAGE_ID,
    data,
  };
}

/**
 * 支付族信封骨架（§4.1 官方 toSignStr 键序逐字）：data 在前，biz_type/
 * message_id/app_id/timestamp 依次殿后，data 由调用方覆写。
 */
export function ksPayEnvelope(bizType: string, data: WirePayload): WirePayload {
  return {
    data,
    biz_type: bizType,
    message_id: KS_PAY_MESSAGE_ID,
    app_id: KS_APP_ID,
    timestamp: KS_PAY_TIMESTAMP,
  };
}

/**
 * 信封的 ID 生成规则（幂等键随新事件变化）：timestamp 按当前毫秒重生成、
 * message_id 按 UUID 形态重生成（每次随机生成的 ID）。
 */
export function ksEnvelopeIdGenerations(): IdGeneration[] {
  return [
    { path: "timestamp", kind: "createTimeMs" },
    { path: "message_id", kind: "ksMessageId" },
  ];
}
