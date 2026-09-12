import { describe, expect, it } from "vitest";

import {
  applyGeneratedIds,
  generateCreateTimeMs,
  generateCreateTimeSec,
  generateEncryptedId,
  generateLogId,
  generateMsgId64,
  generateOpenId,
} from "./ids";
import { schemaById } from "./schemas";

describe("官方 ID 形态生成", () => {
  it("open_id 为 uuid v4 风格小写十六进制", () => {
    const id = generateOpenId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(generateOpenId()).not.toBe(id);
  });

  it("会话/消息 ID 为 @ 开头 base64 风格加密串（== 结尾）", () => {
    const id = generateEncryptedId();
    expect(id).toMatch(/^@[A-Za-z0-9+/]{80,}==$/);
    expect(generateEncryptedId()).not.toBe(id);
  });

  it("log_id 为十六进制串风格（32 位大写 hex，日期时间前缀）", () => {
    const id = generateLogId();
    expect(id).toMatch(/^[0-9A-F]{32}$/);
    expect(id.slice(0, 8)).toMatch(/^(20)\d{6}$/);
    expect(generateLogId()).not.toBe(id);
  });

  it("create_time 为 13 位毫秒时间戳", () => {
    const value = generateCreateTimeMs();
    expect(String(value)).toMatch(/^\d{13}$/);
  });

  it("企微 CreateTime 为 10 位秒级时间戳字符串", () => {
    const value = generateCreateTimeSec();
    expect(value).toMatch(/^\d{10}$/);
    expect(typeof value).toBe("string");
  });

  it("企微 MsgId 为 18 位数字串（恒在 int64 内、首位非零、全字符串）", () => {
    const id = generateMsgId64();
    expect(id).toMatch(/^[1-9]\d{17}$/);
    // 18 位上限 9.99e17 < 2^63-1（9.22e18），且 > 2^53 验证大数语义
    expect(Number(BigInt(id) < BigInt("9223372036854775807"))).toBe(1);
    expect(BigInt(id)).toBeGreaterThan(BigInt("9007199254740992"));
    expect(generateMsgId64()).not.toBe(id);
  });
});

describe("applyGeneratedIds", () => {
  it("按 schema 声明替换 ID 字段，且 sameAs 共用同一生成值", () => {
    const schema = schemaById("dy-text");
    const payload = structuredClone(schema.payload);
    const result = applyGeneratedIds(schema, payload);

    expect(result.from_user_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    // 资料里的 open_id 跟随发送者；第二份资料跟随接收者
    const content = result.content as Record<string, unknown>;
    const userInfos = content.user_infos as Array<Record<string, unknown>>;
    expect(userInfos[0].open_id).toBe(result.from_user_id);
    expect(userInfos[1].open_id).toBe(result.to_user_id);
    // 会话与消息 ID 形态正确且互不相同
    expect(content.conversation_short_id).toMatch(/^@.+==$/);
    expect(content.server_message_id).toMatch(/^@.+==$/);
    expect(content.conversation_short_id).not.toBe(content.server_message_id);
    expect(String(content.create_time)).toMatch(/^\d{13}$/);
    // 非声明的字段保持黄金样本原值
    expect(result.client_key).toBe(schema.payload.client_key);
    expect(content.text).toBe("捷途70");
    expect(result.event).toBe("im_receive_msg");
  });

  it("模板载荷没有的路径不凭空创建（黄金样本均未携带 log_id）", () => {
    const schema = schemaById("dy-text");
    expect(schema.payload.log_id).toBeUndefined();
    const result = applyGeneratedIds(schema, structuredClone(schema.payload));
    expect(result.log_id).toBeUndefined();
    expect(Object.keys(result)).not.toContain("log_id");
  });

  it("dy-image 新建草稿不注入官方样本没有的 user_infos", () => {
    const schema = schemaById("dy-image");
    expect(
      (schema.payload.content as Record<string, unknown>).user_infos,
    ).toBeUndefined();
    const result = applyGeneratedIds(schema, structuredClone(schema.payload));
    expect(
      (result.content as Record<string, unknown>).user_infos,
    ).toBeUndefined();
    // 模板已有的路径照常生成
    expect(result.from_user_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(
      (result.content as Record<string, unknown>).conversation_short_id,
    ).toMatch(/^@.+==$/);
  });

  it("dy-read 新建草稿不注入官方已读事件没有的 create_time", () => {
    const schema = schemaById("dy-read");
    expect(
      (schema.payload.content as Record<string, unknown>).create_time,
    ).toBeUndefined();
    const result = applyGeneratedIds(schema, structuredClone(schema.payload));
    expect(
      (result.content as Record<string, unknown>).create_time,
    ).toBeUndefined();
    expect(
      (result.content as Record<string, unknown>).conversation_short_id,
    ).toMatch(/^@.+==$/);
    expect(result.from_user_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("dy-text 的 user_infos 正常生成（模板已有该数组）", () => {
    const schema = schemaById("dy-text");
    const result = applyGeneratedIds(schema, structuredClone(schema.payload));
    const userInfos = (result.content as Record<string, unknown>)
      .user_infos as Array<Record<string, unknown>>;
    expect(userInfos).toHaveLength(2);
    expect(userInfos[0].open_id).toBe(result.from_user_id);
    expect(userInfos[1].open_id).toBe(result.to_user_id);
  });

  it("contentString 模板在 content 字符串内部替换后仍保持字符串格式", () => {
    const schema = schemaById("dy-enter");
    const result = applyGeneratedIds(schema, structuredClone(schema.payload));
    expect(typeof result.content).toBe("string");
    const content = JSON.parse(result.content as string) as Record<
      string,
      unknown
    >;
    expect(content.conversation_short_id).toMatch(/^@.+==$/);
    expect(String(content.create_time)).toMatch(/^\d{13}$/);
    const userInfos = content.user_infos as Array<Record<string, unknown>>;
    expect(userInfos[0].open_id).toBe(result.from_user_id);
    // 未声明的官方字段原样保留
    expect(content["data-im-extra"]).toBe("123456789");
    expect(content.scene_type).toBe(4);
  });

  it("不修改传入的原对象（返回新载荷）", () => {
    const schema = schemaById("dy-text");
    const original = structuredClone(schema.payload);
    const snapshot = structuredClone(original);
    applyGeneratedIds(schema, original);
    expect(original).toEqual(snapshot);
  });
});

describe("applyGeneratedIds（企微模板）", () => {
  it("wc-text 重生成 MsgId 与秒级 CreateTime，其余保持黄金样本原值", () => {
    const schema = schemaById("wc-text");
    const result = applyGeneratedIds(schema, structuredClone(schema.payload));
    expect(result.MsgId).toMatch(/^[1-9]\d{17}$/);
    expect(result.CreateTime).toMatch(/^\d{10}$/);
    expect(result.Content).toBe("this is a test");
    expect(result.FromUserName).toBe("fromUser");
    // 不凭空注入 content 键（XML 模板无此概念）
    expect("content" in result).toBe(false);
  });

  it("wc-enter 仅重生成 CreateTime：EventKey 仍为空、无 MsgId 注入", () => {
    const schema = schemaById("wc-enter");
    const result = applyGeneratedIds(schema, structuredClone(schema.payload));
    expect(result.CreateTime).toMatch(/^\d{10}$/);
    expect(result.EventKey).toBe("");
    expect(result.MsgId).toBeUndefined();
    expect("content" in result).toBe(false);
  });
});
