import { defineSchema } from "../define";
import type { IdGeneration, WirePayload } from "../types";
import {
  QQ_DEFINITIONS,
  QQ_EVENT_EXPECTED,
  qqEnvelope,
  qqMessageIdGenerations,
} from "./shared";

/**
 * QQ 单聊/群消息三事件（事实库 §2.1/§5.3/§5.4/§5.12，信封见 shared）：
 * - C2C_MESSAGE_CREATE / GROUP_AT_MESSAGE_CREATE：官方黄金样本逐字（d 内容）
 * - GROUP_MESSAGE_CREATE：事实库仅收录字段清单与示例语义（「各字段含义与
 *   GROUP_AT_MESSAGE_CREATE 完全一致」+ 示例 1 文本「大家早上好呀」+
 *   mentions 为相对 GROUP_AT 新增字段），未逐字收录示例 JSON——模板按
 *   GROUP_AT 黄金样本字段组合示例 1 事实，不编造其余取值
 */

/** 官方黄金样本 §5.3：C2C_MESSAGE_CREATE 事件体（逐字，含官方占位符） */
const GOLDEN_C2C: WirePayload = {
  id: "ROBOT1.0_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  author: {
    id: "A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4",
    user_openid: "A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4",
    union_openid: "",
    username: "",
    bot: false,
  },
  content: "你好，今天有什么推荐的活动吗？",
  message_type: 0,
  message_scene: {
    source: "default",
    ext: ["msg_idx=REFIDX_xxxxxxxxxxxxxxx=="],
  },
  timestamp: "2026-07-21T10:00:00+08:00",
};

/** 官方黄金样本 §5.4：GROUP_AT_MESSAGE_CREATE 事件体（逐字，content 前的
 *  空格与首尾空格均为官方原文；群场景 ext 多 auth_token） */
const GOLDEN_GROUP_AT: WirePayload = {
  id: "ROBOT1.0_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  author: {
    id: "A1B2C3D4E5F6A1B2C3D4",
    member_openid: "A1B2C3D4E5F6A1B2C3D4",
    member_role: "member",
    username: "小明",
    bot: false,
  },
  content: " /今日天气 ",
  group_openid: "B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4E5",
  message_type: 0,
  timestamp: "2026-07-21T10:00:00+08:00",
  message_scene: {
    source: "default",
    ext: [
      "msg_idx=REFIDX_xxxxxxxxxxxxxxx==",
      "auth_token=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    ],
  },
};

/** GROUP_MESSAGE_CREATE 事件体：GROUP_AT 字段语义照录 + 事实库示例 1 事实
 *  （文本「大家早上好呀」未 @ 机器人 → mentions 为空列表） */
const COMPOSED_GROUP_MESSAGE: WirePayload = {
  ...GOLDEN_GROUP_AT,
  content: "大家早上好呀",
  mentions: [],
};

/** 单聊事件的 ID 生成规则：author.id 与 user_openid 官方样本同值，共用一generation */
function c2cIdGenerations(): IdGeneration[] {
  return [
    { path: "d.author.id", kind: "qqOpenId" },
    { path: "d.author.user_openid", kind: "qqOpenId", sameAs: "d.author.id" },
  ];
}

/** 群事件的 ID 生成规则：author.id 与 member_openid 官方样本同值；群 openid 独立 */
function groupIdGenerations(): IdGeneration[] {
  return [
    { path: "d.author.id", kind: "qqOpenId" },
    {
      path: "d.author.member_openid",
      kind: "qqOpenId",
      sameAs: "d.author.id",
    },
    { path: "d.group_openid", kind: "qqOpenId" },
  ];
}

export const QQ_MESSAGE_SCHEMAS = [
  defineSchema(QQ_DEFINITIONS, "qq-c2c-message-create", {
    eventName: "C2C_MESSAGE_CREATE",
    name: "C2C 单聊消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: QQ_EVENT_EXPECTED,
    idGenerations: [...qqMessageIdGenerations(), ...c2cIdGenerations()],
    payload: qqEnvelope("C2C_MESSAGE_CREATE", GOLDEN_C2C),
  }),
  defineSchema(QQ_DEFINITIONS, "qq-group-at-message-create", {
    eventName: "GROUP_AT_MESSAGE_CREATE",
    name: "群 @机器人 消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: QQ_EVENT_EXPECTED,
    idGenerations: [...qqMessageIdGenerations(), ...groupIdGenerations()],
    payload: qqEnvelope("GROUP_AT_MESSAGE_CREATE", GOLDEN_GROUP_AT),
  }),
  defineSchema(QQ_DEFINITIONS, "qq-group-message-create", {
    eventName: "GROUP_MESSAGE_CREATE",
    name: "群全量消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: QQ_EVENT_EXPECTED,
    idGenerations: [...qqMessageIdGenerations(), ...groupIdGenerations()],
    payload: qqEnvelope("GROUP_MESSAGE_CREATE", COMPOSED_GROUP_MESSAGE),
  }),
] as const;
