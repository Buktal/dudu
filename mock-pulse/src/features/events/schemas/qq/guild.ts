import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import { QQ_DEFINITIONS, QQ_EVENT_EXPECTED, qqEnvelope } from "./shared";

/**
 * QQ 频道消息两事件（事实库 §2.1/§5.7，信封见 shared）：
 * - AT_MESSAGE_CREATE：官方黄金样本逐字（频道事件页 Message 对象，公域
 *   PUBLIC_GUILD_MESSAGES 1<<30）
 * - DIRECT_MESSAGE_CREATE：事实库仅 Intent + 语义级（DIRECT_MESSAGE 1<<12，
 *   私信不支持沙箱），未逐字收录事件体——私信同为 Message 对象，按频道事件页
 *   AT 样本同构照录（字段结构与取值逐字，不编造其余字段）
 */

/** 官方黄金样本 §5.7：AT_MESSAGE_CREATE 事件体（频道事件页 Message 对象逐字） */
const GOLDEN_GUILD_AT: WirePayload = {
  author: {
    avatar: "http://thirdqq.qlogo.cn/0",
    bot: false,
    id: "1234",
    username: "abc",
  },
  channel_id: "100010",
  content: "ndnnd",
  guild_id: "18700000000001",
  id: "0812345677890abcdef",
  member: {
    joined_at: "2021-04-12T16:34:42+08:00",
    roles: ["1"],
  },
  timestamp: "2021-05-20T15:14:58+08:00",
  seq: 101,
};

export const QQ_GUILD_SCHEMAS = [
  defineSchema(QQ_DEFINITIONS, "qq-at-message-create", {
    eventName: "AT_MESSAGE_CREATE",
    name: "频道 @机器人 消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: QQ_EVENT_EXPECTED,
    idGenerations: [],
    payload: qqEnvelope("AT_MESSAGE_CREATE", GOLDEN_GUILD_AT),
  }),
  defineSchema(QQ_DEFINITIONS, "qq-direct-message-create", {
    eventName: "DIRECT_MESSAGE_CREATE",
    name: "频道私信消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: QQ_EVENT_EXPECTED,
    idGenerations: [],
    payload: qqEnvelope("DIRECT_MESSAGE_CREATE", GOLDEN_GUILD_AT),
  }),
] as const;
