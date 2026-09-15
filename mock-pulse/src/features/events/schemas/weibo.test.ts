import { describe, expect, it } from "vitest";

import { applyGeneratedIds, generateWeiboUid } from "../ids";
import { parseWireDraft, wireBodyText } from "../payload";
import { WB_DEFINITIONS, WB_SCHEMAS } from "./weibo";

/** 官方黄金样本的骨架（事实库 §5 逐字：UID 对与时刻字符串照录） */
const GOLDEN_SKELETON = {
  type: "text",
  receiver_id: 1902538057,
  sender_id: 2489518277,
  created_at: "Mon Jul 16 18:09:20 +0800 2012",
};

describe("微博事件 schema 聚合（粉服 Webhook，JSON 默认格式；握手/验签在 Rust 适配器）", () => {
  it("私信 4 + 事件 8 = 12 模板，id 全仓库唯一", () => {
    expect(WB_SCHEMAS).toHaveLength(12);
    const ids = WB_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith("weibo-"))).toBe(true);
  });

  it("描述文件分文件合并装载合法，且模板条目与协议模块一一对应", () => {
    expect(WB_DEFINITIONS.channelId).toBe("weibo");
    expect(WB_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(WB_DEFINITIONS.schemas).sort()).toEqual(
      WB_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("报文形态绑定：全部模板走 JSON（粉服默认格式，set_format 切 XML 不设模板）", () => {
    for (const schema of WB_SCHEMAS) {
      expect(schema.wire, `${schema.id} wire`).toBe("json");
      expect(schema.contentString, `${schema.id} contentString`).toBe(false);
    }
  });

  it("每个字段都有标题/类型/分组/解释", () => {
    for (const schema of WB_SCHEMAS) {
      for (const field of schema.fields) {
        expect(field.title, `${schema.id}.${field.path} title`).toBeTruthy();
        expect(field.type, `${schema.id}.${field.path} type`).toBeTruthy();
        expect(field.group, `${schema.id}.${field.path} group`).toBeTruthy();
        expect(
          field.description,
          `${schema.id}.${field.path} description`,
        ).toBeTruthy();
      }
    }
  });

  it("默认期望回执 = 渠道真实应答：5 秒内 HTTP 200 即成功（回空串官方不处理不重试）", () => {
    for (const schema of WB_SCHEMAS) {
      // 事实库 §3.3：回执正文无口径（空串/被动回复均合法）→ 只看状态码
      expect(schema.expected, `${schema.id} expected`).toEqual({
        status: 200,
        body: "",
        bodyMode: "contains",
      });
    }
  });

  it("模板载荷逐字节自反：线上 JSON ↔ 载荷解析往返一致", () => {
    for (const schema of WB_SCHEMAS) {
      const text = wireBodyText(schema, schema.payload);
      const parsed = parseWireDraft(schema, text);
      expect(parsed, `${schema.id} 往返载荷`).toEqual(schema.payload);
      expect(wireBodyText(schema, parsed), `${schema.id} 往返明文`).toBe(text);
    }
  });

  it("载荷骨架逐字保真：全部模板共用官方键序与样本值（§5，int64 数字 UID + 时刻字符串）", () => {
    for (const schema of WB_SCHEMAS) {
      expect(Object.keys(schema.payload), `${schema.id} 键序`).toEqual([
        "type",
        "receiver_id",
        "sender_id",
        "created_at",
        "text",
        "data",
      ]);
      expect(schema.payload.receiver_id, `${schema.id} receiver_id`).toBe(
        GOLDEN_SKELETON.receiver_id,
      );
      expect(schema.payload.sender_id, `${schema.id} sender_id`).toBe(
        GOLDEN_SKELETON.sender_id,
      );
      expect(schema.payload.created_at, `${schema.id} created_at`).toBe(
        GOLDEN_SKELETON.created_at,
      );
    }
  });

  it("私信四模板官方样本逐字（§5.1–§5.4：position 不是 location，经纬度字符串、媒体 ID 数字）", () => {
    const payloadOf = (id: string) =>
      WB_SCHEMAS.find((schema) => schema.id === id)?.payload;
    expect(payloadOf("weibo-text")).toEqual({
      ...GOLDEN_SKELETON,
      text: "私信或留言内容",
      data: {},
    });
    expect(payloadOf("weibo-position")).toEqual({
      ...GOLDEN_SKELETON,
      type: "position",
      text: "我在这里: http://t.cn/zQgLLYO",
      data: { longitude: "116.308586", latitude: "39.982525" },
    });
    expect(payloadOf("weibo-voice")).toEqual({
      ...GOLDEN_SKELETON,
      type: "voice",
      text: "发了一个语音消息",
      data: { vfid: 821804459, tovfid: 821804469 },
    });
    expect(payloadOf("weibo-image")).toEqual({
      ...GOLDEN_SKELETON,
      type: "image",
      text: "发了一张图片",
      data: { vfid: 821804459, tovfid: 821804469 },
    });
  });

  it("事件八模板判型与官方默认文案逐字（type:event + data.subtype）", () => {
    for (const schema of WB_SCHEMAS) {
      if (schema.kind !== "event") continue;
      expect(schema.payload.type, `${schema.id} type`).toBe("event");
      const data = schema.payload.data as Record<string, unknown>;
      expect(data.subtype, `${schema.id} subtype`).toBe(schema.eventName);
    }
    const textOf = (id: string) =>
      WB_SCHEMAS.find((schema) => schema.id === id)?.payload.text;
    expect(textOf("weibo-follow")).toBe("关注事件消息");
    expect(textOf("weibo-unfollow")).toBe("取消关注事件消息");
    expect(textOf("weibo-subscribe")).toBe("订阅事件消息");
    expect(textOf("weibo-unsubscribe")).toBe("取消订阅事件消息");
    expect(textOf("weibo-scan")).toBe("扫描二维码");
    expect(textOf("weibo-scan-follow")).toBe("扫描二维码");
    expect(textOf("weibo-click")).toBe("自定义菜单点击事件消息");
    expect(textOf("weibo-view")).toBe("自定义菜单跳转链接事件消息");
  });

  it("扫码两模板按 §5.7 逐字：key=action_name_scene_id、ticket=TICKET（官方行尾逗号笔误不进载荷）", () => {
    const payloadOf = (id: string) =>
      WB_SCHEMAS.find((schema) => schema.id === id)?.payload;
    const dataOf = (id: string) =>
      payloadOf(id)?.data as Record<string, unknown>;
    // scan 与 scan_follow 同构（事实库 §2.2 分流规则），只差 subtype
    expect(dataOf("weibo-scan")).toEqual({
      subtype: "scan",
      key: "action_name_scene_id",
      ticket: "TICKET",
    });
    expect(dataOf("weibo-scan-follow")).toEqual({
      subtype: "scan_follow",
      key: "action_name_scene_id",
      ticket: "TICKET",
    });
  });

  it("菜单两模板按 §5.9/§5.10 逐字：click=EVENT_KEY、view=url 占位", () => {
    const dataOf = (id: string) =>
      WB_SCHEMAS.find((schema) => schema.id === id)?.payload.data as Record<
        string,
        unknown
      >;
    expect(dataOf("weibo-click")).toEqual({
      subtype: "click",
      key: "EVENT_KEY",
    });
    expect(dataOf("weibo-view")).toEqual({ subtype: "view", key: "url" });
  });

  it("mention 已暂停不收（事实库 §2.2）：无 mention 模板", () => {
    expect(WB_SCHEMAS.some((schema) => schema.id.includes("mention"))).toBe(
      false,
    );
  });

  it("ID 生成器官方形态：UID 为 10 位 int64 数字、created_at 为线上字符串格式", () => {
    const uid = generateWeiboUid();
    expect(String(uid)).toMatch(/^[1-9]\d{9}$/);
    expect(generateWeiboUid()).not.toBe(uid);

    const schema = WB_SCHEMAS[0];
    const result = applyGeneratedIds(schema, structuredClone(schema.payload));
    expect(Number.isInteger(result.receiver_id)).toBe(true);
    expect(String(result.receiver_id)).toMatch(/^[1-9]\d{9}$/);
    expect(String(result.sender_id)).toMatch(/^[1-9]\d{9}$/);
    expect(result.created_at).toMatch(
      /^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{2} \d{2}:\d{2}:\d{2} [+-]\d{4} \d{4}$/,
    );
    // 黄金样本原值被重生成（排重键 sender_id+created_at 随新事件变化）
    expect(result.created_at).not.toBe(schema.payload.created_at);
  });

  it("事件目录：私信四 type + 事件八 subtype", () => {
    expect(WB_SCHEMAS.map((schema) => schema.eventName)).toEqual([
      "text",
      "position",
      "voice",
      "image",
      "follow",
      "unfollow",
      "subscribe",
      "unsubscribe",
      "scan",
      "scan_follow",
      "click",
      "view",
    ]);
    expect(WB_SCHEMAS.map((schema) => schema.kind)).toEqual([
      "message",
      "message",
      "message",
      "message",
      "event",
      "event",
      "event",
      "event",
      "event",
      "event",
      "event",
      "event",
    ]);
  });
});
