import { describe, expect, it } from "vitest";

import { applyGeneratedIds } from "../ids";
import { TG_DEFINITIONS, TG_SCHEMAS } from "./telegram";

/** 官方 §5.2 webhooks 指南自测样本的公共值（事实库逐字） */
const GOLDEN_UPDATE_ID = 10000;
const GOLDEN_DATE = 1441645532;
const GOLDEN_CHAT_ID = 1111111;
const GOLDEN_MESSAGE_ID = 1365;
const GOLDEN_CALLBACK_ID = "4382bfdwdsb323b2d9";
const GOLDEN_INLINE_MESSAGE_ID = "1234csdbsk4839";

const schemaOf = (schemaId: string) => {
  const schema = TG_SCHEMAS.find((item) => item.id === schemaId);
  expect(schema, schemaId).toBeDefined();
  if (!schema) throw new Error(schemaId);
  return schema;
};

/** §5.2 message 样本本体（「结构同上」代表的同构基准） */
const GOLDEN_MESSAGE = {
  date: GOLDEN_DATE,
  chat: {
    last_name: "Test Lastname",
    id: GOLDEN_CHAT_ID,
    type: "private",
    first_name: "Test Firstname",
    username: "Testusername",
  },
  message_id: GOLDEN_MESSAGE_ID,
  from: {
    last_name: "Test Lastname",
    id: GOLDEN_CHAT_ID,
    first_name: "Test Firstname",
    username: "Testusername",
  },
  text: "/start",
};

/** 取模板载荷的事件字段对象（update_id 之后的首个键） */
const updateFieldOf = (payload: Record<string, unknown>) => {
  const entry = Object.entries(payload).find(([key]) => key !== "update_id");
  if (!entry) throw new Error("Update 信封缺少事件字段");
  return { field: entry[0], value: entry[1] as Record<string, unknown> };
};

describe("Telegram 事件 schema 聚合（Bot Webhook；恒等头与探针在 Rust 适配器）", () => {
  it("消息族 4 + 回调查询 1 + 成员变更 2 = 7 模板，id 全仓库唯一且 tg- 前缀", () => {
    expect(TG_SCHEMAS).toHaveLength(7);
    const ids = TG_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("tg-"))).toBe(true);
  });

  it("描述文件分文件合并装载合法，且模板条目与协议模块一一对应", () => {
    expect(TG_DEFINITIONS.channelId).toBe("telegram");
    expect(TG_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(TG_DEFINITIONS.schemas).sort()).toEqual(
      TG_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("报文形态绑定：全部模板走 JSON 明文（Update 对象 POST，事件体不加密）", () => {
    for (const schema of TG_SCHEMAS) {
      expect(schema.wire, `${schema.id} wire`).toBe("json");
      expect(schema.contentString, `${schema.id} contentString`).toBe(false);
    }
  });

  it("默认期望回执 = 渠道真实应答：成功判 2XY（正文无口径；非 2XY 按合理次数重推）", () => {
    for (const schema of TG_SCHEMAS) {
      // 事实库 §3.3/§附速查：非 2XY 状态码即投递失败重推——空串 = 只看状态码
      expect(schema.expected, `${schema.id} expected`).toEqual({
        status: 200,
        body: "",
        bodyMode: "contains",
      });
    }
  });

  it("Update 信封键序（§5.2 官方样本：update_id 在前、事件字段在后，一 Update 一事件字段）", () => {
    for (const schema of TG_SCHEMAS) {
      const keys = Object.keys(schema.payload);
      expect(keys[0], `${schema.id} 首键`).toBe("update_id");
      expect(keys, `${schema.id} 单事件字段`).toHaveLength(2);
      expect(schema.payload.update_id).toBe(GOLDEN_UPDATE_ID);
      expect(schema.eventName).toBe(keys[1]);
    }
  });

  it("message 载荷逐字（§5.2 官方自测样本键序与值）", () => {
    const schema = schemaOf("tg-update-message");
    expect(schema.kind).toBe("message");
    const { value: message } = updateFieldOf(schema.payload);
    // 官方键序：date → chat → message_id → from → text
    expect(Object.keys(message)).toEqual([
      "date",
      "chat",
      "message_id",
      "from",
      "text",
    ]);
    expect(message).toEqual(GOLDEN_MESSAGE);
    // 数字形态照录官方样本（date/chat.id/message_id/from.id 均为 JSON number）
    expect(message.date).toBeTypeOf("number");
    expect((message.chat as Record<string, unknown>).id).toBeTypeOf("number");
  });

  it("callback_query 载荷逐字（§5.2 官方样本键序与值，from.type 系官方原文照录）", () => {
    const schema = schemaOf("tg-update-callback-query");
    expect(schema.kind).toBe("event");
    const { value: query } = updateFieldOf(schema.payload);
    // 官方键序：id → from → data → inline_message_id
    expect(Object.keys(query)).toEqual([
      "id",
      "from",
      "data",
      "inline_message_id",
    ]);
    expect(query.id).toBe(GOLDEN_CALLBACK_ID);
    // from 键序照录官方样本（last_name → type → id → first_name → username，
    // webhooks 指南原文即含 type: private，文档原样不作裁剪）
    expect(Object.keys(query.from as Record<string, unknown>)).toEqual([
      "last_name",
      "type",
      "id",
      "first_name",
      "username",
    ]);
    expect(query.from).toEqual({
      last_name: "Test Lastname",
      type: "private",
      id: GOLDEN_CHAT_ID,
      first_name: "Test Firstname",
      username: "Testusername",
    });
    expect(query.data).toBe("Data from button callback");
    expect(query.inline_message_id).toBe(GOLDEN_INLINE_MESSAGE_ID);
  });

  it("edited_message/channel_post 族代表按官方口径构造：message 同构、编辑语义由信封字段名承载", () => {
    const edited = schemaOf("tg-update-edited-message");
    const { value: editedMessage } = updateFieldOf(edited.payload);
    // webhooks 指南「结构同上」：与 message 样本同构
    expect(editedMessage).toEqual(GOLDEN_MESSAGE);

    const post = schemaOf("tg-update-channel-post");
    const { value: channelPost } = updateFieldOf(post.payload);
    // 频道帖样本未给（待核验(09-27)）：按 message 同构从简，type=channel 为
    // 语义对齐构造值、id 占位取官方样本同源数字
    expect(Object.keys(channelPost)).toEqual([
      "date",
      "chat",
      "message_id",
      "text",
    ]);
    expect(channelPost.chat).toEqual({ id: GOLDEN_CHAT_ID, type: "channel" });

    const editedPost = schemaOf("tg-update-edited-channel-post");
    expect(updateFieldOf(editedPost.payload).value).toEqual(channelPost);
  });

  it("成员变更双事件：ChatMemberUpdated 载荷样本未给——空对象占位，订阅语义由字段名承载", () => {
    const myChatMember = schemaOf("tg-update-my-chat-member");
    expect(updateFieldOf(myChatMember.payload).value).toEqual({});

    const chatMember = schemaOf("tg-update-chat-member");
    // chat_member 须管理员 + allowed_updates 显式订阅（默认订阅三例外之一）
    expect(updateFieldOf(chatMember.payload).value).toEqual({});
    expect(chatMember.name).toContain("显式订阅");
  });

  it("事件目录：消息族 4 message + 回调查询/成员变更 3 event", () => {
    expect(TG_SCHEMAS.map((schema) => schema.id)).toEqual([
      "tg-update-message",
      "tg-update-edited-message",
      "tg-update-channel-post",
      "tg-update-edited-channel-post",
      "tg-update-callback-query",
      "tg-update-my-chat-member",
      "tg-update-chat-member",
    ]);
    expect(TG_SCHEMAS.map((schema) => schema.kind)).toEqual([
      "message",
      "message",
      "message",
      "message",
      "event",
      "event",
      "event",
    ]);
  });

  it("ID 生成器官方形态：update_id 正整数重生成（去重键）、message 族 date 数字秒级重生成", () => {
    const message = schemaOf("tg-update-message");
    const messageDraft = applyGeneratedIds(
      message,
      structuredClone(message.payload),
    );
    // update_id 重生成：正整数 JSON number、与官方样本同量级（5 位）
    expect(typeof messageDraft.update_id).toBe("number");
    expect(messageDraft.update_id).not.toBe(GOLDEN_UPDATE_ID);
    expect(String(messageDraft.update_id)).toMatch(/^[1-9]\d{4}$/);
    const { value: messageBody } = updateFieldOf(messageDraft);
    // date 数字秒级重生成；message_id/from/chat 系官方样本值不重生成
    expect(messageBody.date).toBeTypeOf("number");
    expect(String(messageBody.date)).toMatch(/^\d{10}$/);
    expect(messageBody.date).not.toBe(GOLDEN_DATE);
    expect(messageBody.message_id).toBe(GOLDEN_MESSAGE_ID);
    expect(messageBody.text).toBe("/start");

    const query = schemaOf("tg-update-callback-query");
    const queryDraft = applyGeneratedIds(query, structuredClone(query.payload));
    expect(queryDraft.update_id).not.toBe(GOLDEN_UPDATE_ID);
    // callback_query.id 取官方样本值不重生成（格式口径仅单样本）
    expect(updateFieldOf(queryDraft).value.id).toBe(GOLDEN_CALLBACK_ID);

    const member = schemaOf("tg-update-my-chat-member");
    const memberDraft = applyGeneratedIds(
      member,
      structuredClone(member.payload),
    );
    expect(memberDraft.update_id).not.toBe(GOLDEN_UPDATE_ID);
    expect(updateFieldOf(memberDraft).value).toEqual({});
  });
});
