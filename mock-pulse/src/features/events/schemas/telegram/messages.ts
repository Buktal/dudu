import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import { TG_DEFINITIONS, TG_EXPECTED, tgUpdateEnvelope } from "./shared";

/**
 * message / edited_message / channel_post / edited_channel_post 推送
 * （事实库 §2.2 Update 表 + §5.2 webhooks 指南官方自测样本）：判型字段为
 * Update 信封的事件字段名（任一 Update 至多含一个可选事件字段，§2.1）。
 * message 为官方样本逐字；edited_message 按 webhooks 指南「结构同上」口径
 * 构造；channel_post 族按 message 同构构造（频道帖官方样本未给，占位注明，
 * 骨架从简不编造字段）。
 */

/** 官方 §5.2 样本逐字：私聊文本消息（webhooks 指南自测 curl 的 -d 体） */
const GOLDEN_MESSAGE: WirePayload = {
  date: 1441645532,
  chat: {
    last_name: "Test Lastname",
    id: 1111111,
    type: "private",
    first_name: "Test Firstname",
    username: "Testusername",
  },
  message_id: 1365,
  from: {
    last_name: "Test Lastname",
    id: 1111111,
    first_name: "Test Firstname",
    username: "Testusername",
  },
  text: "/start",
};

/**
 * edited_message 代表（webhooks 指南同页另有 edited_message 版式 curl、注明
 * 结构同上，官方整段原文未录入事实库）：载荷 = message 样本同构，编辑语义
 * 由信封字段名承载。
 */
const EDITED_MESSAGE: WirePayload = { ...GOLDEN_MESSAGE };

/**
 * channel_post 代表（api#update 表「新频道帖（任意类型）」：频道帖载荷官方
 * 样本未给，待核验(09-27)）——按 message 同构从简：chat.type=channel 为语义
 * 对齐构造值，id 占位取官方样本同源数字。
 */
const CHANNEL_POST: WirePayload = {
  date: GOLDEN_MESSAGE.date,
  chat: { id: 1111111, type: "channel" },
  message_id: GOLDEN_MESSAGE.message_id,
  text: GOLDEN_MESSAGE.text,
};

/** edited_channel_post 代表：与 channel_post 同构，编辑语义由信封字段名承载 */
const EDITED_CHANNEL_POST: WirePayload = { ...CHANNEL_POST };

const tgDateGeneration = (field: string) => ({
  path: `${field}.date`,
  kind: "createTimeSecNumber" as const,
});

export const TG_MESSAGES_SCHEMAS = [
  defineSchema(TG_DEFINITIONS, "tg-update-message", {
    eventName: "message",
    name: "新收消息·私聊文本（message）",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: TG_EXPECTED,
    idGenerations: [
      { path: "update_id", kind: "tgUpdateId" },
      tgDateGeneration("message"),
    ],
    payload: tgUpdateEnvelope("message", GOLDEN_MESSAGE),
  }),
  defineSchema(TG_DEFINITIONS, "tg-update-edited-message", {
    eventName: "edited_message",
    name: "消息被编辑（edited_message）",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: TG_EXPECTED,
    idGenerations: [
      { path: "update_id", kind: "tgUpdateId" },
      tgDateGeneration("edited_message"),
    ],
    payload: tgUpdateEnvelope("edited_message", EDITED_MESSAGE),
  }),
  defineSchema(TG_DEFINITIONS, "tg-update-channel-post", {
    eventName: "channel_post",
    name: "新频道帖·文本（channel_post）",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: TG_EXPECTED,
    idGenerations: [
      { path: "update_id", kind: "tgUpdateId" },
      tgDateGeneration("channel_post"),
    ],
    payload: tgUpdateEnvelope("channel_post", CHANNEL_POST),
  }),
  defineSchema(TG_DEFINITIONS, "tg-update-edited-channel-post", {
    eventName: "edited_channel_post",
    name: "频道帖被编辑（edited_channel_post）",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: TG_EXPECTED,
    idGenerations: [
      { path: "update_id", kind: "tgUpdateId" },
      tgDateGeneration("edited_channel_post"),
    ],
    payload: tgUpdateEnvelope("edited_channel_post", EDITED_CHANNEL_POST),
  }),
] as const;
