import csDefinitions from "../../definitions/kuaishou/kuaishou-cs.json";
import openDefinitions from "../../definitions/kuaishou/kuaishou-open.json";
import payDefinitions from "../../definitions/kuaishou/kuaishou-pay.json";
import {
  mergeChannelDefinitions,
  parseChannelDefinition,
} from "../../definitions/loader";
import type { ExpectedReceipt, IdGeneration, WirePayload } from "../types";

/**
 * 快手渠道协议元数据公共体（事实库 docs/research/channels/kuaishou.md，
 * 三面并行）：
 * - 开放平台 WebHook（§2.1）：信封 `event` 判型，五字段
 *   {app_id, event, timestamp, message_id, data}（accessGuide 自称"四个"实列
 *   五个，原文如此）；全目录穷尽仅 3 事件（官方文档站 bundle 路由枚举实锤）
 * - 小程序支付回调族（§2.2/§4.1）：信封 `biz_type` 判型（无 event 字段），
 *   toSignStr 键序 data/biz_type/message_id/app_id/timestamp（官方验证示例逐字）
 * - 电商智能客服推送（§6.5.3）：明文 JSON + header `Ks-Sign` =
 *   MD5(AppKey + body)（与开放域 kwaisign 的 body+secret 拼接顺序相反、
 *   header 名不同）；body 为 requestId 信封（`type` 判型 1 消息/2 转接），
 *   推送地址线下报备、无 TEST 握手
 * - 验签（§4.1/§6.5.3）：签名放 http header——由 Rust 适配器完成（原始字节
 *   口径，模板只持明文），无 AES
 * - 应答：开放域两族 HTTP 200 + {"result":1,"message_id":"<收到的消息 ID>"}
 *   （§3.2 七页逐字一致，result=1 之外一律失败并按重试表重推）；智能客服
 *   {"result":1} 无 message_id 回传（§6.5.3「返回协议由快手侧定义」）
 * 字段说明与版本/来源由 definitions/kuaishou/ 分域描述文件装载即校验后合并。
 */

/** 版本化字段描述文件：按域分三份，装载即校验（坏文件启动即炸）后合并 */
export const KS_DEFINITIONS = mergeChannelDefinitions(
  [openDefinitions, payDefinitions, csDefinitions].map((part) =>
    parseChannelDefinition(part),
  ),
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

/**
 * 智能客服应答（§6.5.3）：HTTP 200 且 result=1，应答体由快手侧定义为
 * {"result":1}——与开放域不同，无 message_id 回传义务。
 */
export const KS_CS_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: '{"result":1}',
  bodyMode: "jsonField",
};

/** §6.5.2 入参表官方示例的 requestId（fadbsadfg1323 逐字；推送侧同名字段共用） */
export const KS_CS_REQUEST_ID = "fadbsadfg1323";

/** §6.5.2 CURL 示例官方时间戳（1623135246890 逐字；createTime 同族毫秒口径） */
export const KS_CS_CREATE_TIME = 1623135246890;

/**
 * 智能客服信封骨架（§6.5.3 body 表键序）：requestId/createTime/generator/
 * type/fromUser/toUser/transferList/message/context，message 与 transferList
 * 由调用方覆写。
 */
export function ksCsEnvelope(
  type: number,
  message: WirePayload,
  transferList: WirePayload[],
): WirePayload {
  return {
    requestId: KS_CS_REQUEST_ID,
    createTime: KS_CS_CREATE_TIME,
    // 1 = 快手侧发起的会话（买家消息，服务商异步回复）
    generator: 1,
    type,
    fromUser: { nickName: "快手用户1234", role: 1, openId: "OPEN_ID" },
    toUser: { nickName: "MERCHANT_NICK_NAME", role: 2 },
    transferList,
    message,
    context: {
      sellerId: 12342323,
      openId: "OPEN_ID",
      itemId: "ITEM_ID",
      orderId: "12345",
      orderStatus: 40,
      assistantOnlineStatus: 1,
    },
  };
}

/**
 * 智能客服信封的 ID 生成规则：requestId（唯一请求 ID，幂等键）与 createTime
 * 随新事件重生成；买家 openId 为账号身份不随消息变化（同开放域 open_id 占位口径）。
 */
export function ksCsIdGenerations(): IdGeneration[] {
  return [
    { path: "requestId", kind: "ksRequestId" },
    { path: "createTime", kind: "createTimeMs" },
  ];
}
