import {
  mergeChannelDefinitions,
  parseChannelDefinition,
} from "../../definitions/loader";
import guildDefinitions from "../../definitions/qq/qq-guild.json";
import messagesDefinitions from "../../definitions/qq/qq-messages.json";
import relationsDefinitions from "../../definitions/qq/qq-relations.json";
import verifyDefinitions from "../../definitions/qq/qq-verify.json";
import type { ExpectedReceipt, IdGeneration, WirePayload } from "../types";

/**
 * QQ 机器人渠道协议元数据公共体（事实库 docs/research/channels/qq.md）：
 * Webhook 子形态——平台 POST 通用信封 `{id, op:0, d, s, t}`（事实库 §5.1，
 * Webhook/WebSocket 同构），头 X-Signature-Ed25519 / X-Signature-Timestamp /
 * X-Bot-Appid，Ed25519 验签（seed = AppSecret 翻倍截断 32 字节）由 Rust 适配器
 * 完成，无 AES 加密体。op13 验证回调（plain_token/event_ts）为独立信封
 * `{"d":{…},"op":13}`，目标回包按 qqSignReply 形态比对（适配器验回显与签名）。
 */

/** 版本化字段描述文件：按推送域分四份（op13 验证/单聊群/频道/关系链），
 *  装载即校验（坏文件启动即炸）后合并 */
export const QQ_DEFINITIONS = mergeChannelDefinitions(
  [
    verifyDefinitions,
    messagesDefinitions,
    guildDefinitions,
    relationsDefinitions,
  ].map((part) => parseChannelDefinition(part)),
);

/**
 * 普通事件的官方默认应答（事实库 §3.1/§7.1）：op12 `HTTP Callback ACK` 只定义
 * 「仅用于 http 回调模式的回包，代表机器人收到了平台推送的数据」，回包体
 * 格式官方无口径（待核验 09-27）——只校验 HTTP 200。
 */
export const QQ_EVENT_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "",
  bodyMode: "contains",
};

/**
 * op13 验证回调的官方应答（事实库 §3.2）：目标须回
 * `{"plain_token":"<同值>","signature":"<hex(Ed25519)>"}`——期望按 qqSignReply
 * 形态声明：Rust 适配器按连接 AppSecret 验 plain_token 回显与 Ed25519 签名，
 * 验签通过时回显值落回执 reply；期望正文即官方样本 plain_token。
 */
export const QQ_VERIFY_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "Arq0D5A61EgUu4OxUvOp",
  bodyMode: "qqSignReply",
};

/**
 * 通用事件信封（事实库 §5.1 官方形态逐字，键序随原文 id/op/d/s/t）：
 * id 为官方占位符原文 event_id、s 取官方样本值 42；d 为各事件黄金样本。
 */
export function qqEnvelope(t: string, d: WirePayload): WirePayload {
  return { id: "event_id", op: 0, d, s: 42, t };
}

/** C2C/群消息事件的 ID 生成规则：信封 d.id（ROBOT1.0_*，被动回复 msg_id） */
export function qqMessageIdGenerations(): IdGeneration[] {
  return [{ path: "d.id", kind: "qqRobotMsgId" }];
}
