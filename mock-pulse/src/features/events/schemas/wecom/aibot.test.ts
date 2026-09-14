import { describe, expect, it } from "vitest";

import { applyGeneratedIds } from "../../ids";
import { getAt } from "../../payload";
import { schemaById } from "../registry";
import { WECOM_AIBOT_SCHEMAS } from "./aibot";

/** 官方黄金样本 §5.7：引用消息完整回调（逐字） */
const GOLDEN_WB_QUOTE = {
  msgid: "CAIQ16HMjQYY/NGagIOAgAMgq4KM0AI=",
  aibotid: "AIBOTID",
  chatid: "CHATID",
  chattype: "group",
  from: {
    userid: "USERID",
  },
  response_url: "RESPONSEURL",
  msgtype: "text",
  text: {
    content: "@RobotA hello robot",
  },
  quote: {
    msgtype: "text",
    text: {
      content: "这是今日的测试情况",
    },
  },
};

describe("企微智能机器人 JSON 模板（事实库 §2.10 + §5.7）", () => {
  it("提供收消息 7 msgtype + 收事件 4 种共 11 个模板", () => {
    expect(WECOM_AIBOT_SCHEMAS.map((schema) => schema.id)).toEqual([
      "wb-text",
      "wb-quote",
      "wb-mixed",
      "wb-image",
      "wb-voice",
      "wb-file",
      "wb-video",
      "wb-event",
      "wb-event-enter-chat",
      "wb-event-template-card",
      "wb-event-template-card-menu",
    ]);
    expect(
      WECOM_AIBOT_SCHEMAS.filter((schema) => schema.kind === "message"),
    ).toHaveLength(7);
    expect(
      WECOM_AIBOT_SCHEMAS.filter((schema) => schema.kind === "event"),
    ).toHaveLength(4);
  });

  it("quote 引用消息逐字复刻官方 §5.7 黄金样本", () => {
    expect(schemaById("wb-quote").payload).toEqual(GOLDEN_WB_QUOTE);
    // 文本消息 = 同一样本去掉 quote 引用结构
    expect(schemaById("wb-text").payload).toEqual({
      ...GOLDEN_WB_QUOTE,
      quote: undefined,
    });
  });

  it("媒体四类（image/voice/file/video）按官方约束仅单聊（chattype=single）", () => {
    for (const id of ["wb-image", "wb-voice", "wb-file", "wb-video"]) {
      expect(schemaById(id).payload.chattype, id).toBe("single");
    }
    for (const id of ["wb-text", "wb-quote", "wb-mixed"]) {
      expect(schemaById(id).payload.chattype, id).toBe("group");
    }
  });

  it("收事件走 event 通用格式（msgtype=event + event.eventtype），不携带 response_url", () => {
    expect(schemaById("wb-event-enter-chat").payload).toEqual({
      msgid: "CAIQ16HMjQYY/NGagIOAgAMgq4KM0AI=",
      aibotid: "AIBOTID",
      chatid: "CHATID",
      chattype: "group",
      from: { userid: "USERID" },
      msgtype: "event",
      event: { eventtype: "enter_chat" },
    });
    expect(schemaById("wb-event-template-card").payload.event).toEqual({
      eventtype: "template_card_event",
    });
    expect(schemaById("wb-event-template-card-menu").payload.event).toEqual({
      eventtype: "template_card_menu_event",
    });
    for (const schema of WECOM_AIBOT_SCHEMAS.filter(
      (item) => item.kind === "event",
    )) {
      expect(
        schema.payload.response_url,
        `${schema.id} response_url`,
      ).toBeUndefined();
    }
  });

  it("msgid 生成声明为机器人专属形态（base64 风格串），公共字段描述齐备", () => {
    for (const schema of WECOM_AIBOT_SCHEMAS) {
      expect(schema.idGenerations).toEqual([
        { path: "msgid", kind: "aibotMsgId" },
      ]);
      expect(
        schema.fields.some((field) => field.path === "aibotid"),
        `${schema.id} aibotid`,
      ).toBe(true);
      expect(
        schema.fields.some((field) => field.path === "from.userid"),
        `${schema.id} from.userid`,
      ).toBe(true);
    }
    // 新建草稿按官方形态重生成 msgid（31 字符 base64 字母表 + "="，逐字对齐 §5.7 形态）
    const schema = schemaById("wb-text");
    const regenerated = applyGeneratedIds(schema, schema.payload);
    expect(regenerated.msgid).not.toBe(schema.payload.msgid);
    expect(/^[A-Za-z0-9+/]{31}=$/.test(regenerated.msgid as string)).toBe(true);
    // 其余公共字段保持黄金样本原值
    expect(regenerated.aibotid).toBe("AIBOTID");
    expect(getAt(regenerated, "text.content")).toBe("@RobotA hello robot");
  });

  it("线上形态为 JSON（加密信封由 Rust 适配器完成，receiveid 为空）", () => {
    for (const schema of WECOM_AIBOT_SCHEMAS) {
      expect(schema.wire, schema.id).toBe("json");
      expect(schema.xmlLayout).toBeUndefined();
      expect(schema.contentString).toBe(false);
    }
  });
});
