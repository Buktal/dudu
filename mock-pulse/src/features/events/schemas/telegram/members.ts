import { defineSchema } from "../define";
import { TG_DEFINITIONS, TG_EXPECTED, tgUpdateEnvelope } from "./shared";

/**
 * my_chat_member / chat_member 推送（事实库 §2.2 Update 表）：成员状态变更
 * 双事件——bot 自身（my_chat_member，私聊仅 block/unblock 时收到）与他人
 * （chat_member，须管理员 + allowed_updates 显式订阅，默认订阅三例外之一）。
 * ChatMemberUpdated 载荷官方样本未给（待核验(09-27)）：空对象占位、订阅
 * 语义由信封字段名承载（同 WhatsApp account-update 先例），骨架从简不编造
 * 字段。
 */
export const TG_MEMBERS_SCHEMAS = [
  defineSchema(TG_DEFINITIONS, "tg-update-my-chat-member", {
    eventName: "my_chat_member",
    name: "Bot 成员状态变更（my_chat_member）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: TG_EXPECTED,
    idGenerations: [{ path: "update_id", kind: "tgUpdateId" }],
    payload: tgUpdateEnvelope("my_chat_member", {}),
  }),
  defineSchema(TG_DEFINITIONS, "tg-update-chat-member", {
    eventName: "chat_member",
    name: "成员状态变更（chat_member，须显式订阅）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: TG_EXPECTED,
    idGenerations: [{ path: "update_id", kind: "tgUpdateId" }],
    payload: tgUpdateEnvelope("chat_member", {}),
  }),
] as const;
