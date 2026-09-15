import { defineSchema } from "../define";
import { TG_DEFINITIONS, TG_EXPECTED, tgUpdateEnvelope } from "./shared";

/**
 * callback_query 推送（事实库 §2.2 Update 表 + §5.2 webhooks 指南官方自测
 * 样本逐字）：内联按钮点击。判型字段为信封事件字段名 callback_query；
 * 样本 from 内的 type 字段系官方文档原文照录（User 对象官方样本即含）。
 */
export const TG_QUERIES_SCHEMAS = [
  defineSchema(TG_DEFINITIONS, "tg-update-callback-query", {
    eventName: "callback_query",
    name: "内联按钮点击（callback_query）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: TG_EXPECTED,
    // callback_query.id / data / inline_message_id 取官方样本值不重生成
    //（格式口径仅单样本，不立生成规则）；update_id 为去重键重生成
    idGenerations: [{ path: "update_id", kind: "tgUpdateId" }],
    payload: tgUpdateEnvelope("callback_query", {
      id: "4382bfdwdsb323b2d9",
      from: {
        last_name: "Test Lastname",
        type: "private",
        id: 1111111,
        first_name: "Test Firstname",
        username: "Testusername",
      },
      data: "Data from button callback",
      inline_message_id: "1234csdbsk4839",
    }),
  }),
] as const;
