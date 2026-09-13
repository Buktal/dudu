import { describe, expect, it } from "vitest";

import {
  DOUYIN_EVENT_SCHEMAS,
  type EventSchema,
  schemaById,
  WECOM_EVENT_SCHEMAS,
} from "../schemas";
import {
  CHANNEL_DEFINITIONS,
  DEFINITIONS_FORMAT,
  parseChannelDefinition,
  parseFieldDescriptor,
  schemaDefinition,
} from "./loader";

describe("渠道描述文件解析（带类型校验的 loader）", () => {
  it("两渠道描述文件合法装载，带 format 与文件级版本标识", () => {
    for (const channel of [
      CHANNEL_DEFINITIONS.douyin,
      CHANNEL_DEFINITIONS.wecom,
    ]) {
      expect(channel.format).toBe(DEFINITIONS_FORMAT);
      expect(channel.format).toBe("mockpulse-field-definitions-v1");
      expect(channel.version).toBe("2026.09");
      expect(Object.keys(channel.schemas).length).toBeGreaterThan(0);
    }
    expect(CHANNEL_DEFINITIONS.douyin.channelId).toBe("douyin");
    expect(CHANNEL_DEFINITIONS.wecom.channelId).toBe("wecom");
  });

  it("描述文件里的模板集合与 schemas.ts 一致（dy 四个 / wc 三个）", () => {
    expect(Object.keys(CHANNEL_DEFINITIONS.douyin.schemas).sort()).toEqual(
      DOUYIN_EVENT_SCHEMAS.map((schema) => schema.id).sort(),
    );
    expect(Object.keys(CHANNEL_DEFINITIONS.wecom.schemas).sort()).toEqual(
      WECOM_EVENT_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("每个模板条目带版本与官方文档来源，字段形状完整", () => {
    const all: EventSchema[] = [
      ...DOUYIN_EVENT_SCHEMAS,
      ...WECOM_EVENT_SCHEMAS,
    ];
    for (const schema of all) {
      const entry = schemaDefinition(schema.id);
      expect(entry.version, `${schema.id} version`).toBe("2026.09");
      expect(entry.source, `${schema.id} source`).toMatch(/^https:\/\//);
      for (const field of entry.fields) {
        expect(field.path, `${schema.id} path`).toBeTruthy();
        expect(field.title, `${schema.id}.${field.path} title`).toBeTruthy();
        expect(field.group, `${schema.id}.${field.path} group`).toBeTruthy();
        expect(
          field.description,
          `${schema.id}.${field.path} description`,
        ).toBeTruthy();
      }
    }
  });

  it("format 不匹配时报错并指出需要的格式", () => {
    expect(() =>
      parseChannelDefinition({ format: "other-v2", channelId: "douyin" }),
    ).toThrow("mockpulse-field-definitions-v1");
  });

  it("channelId 不在渠道注册表时报错", () => {
    expect(() =>
      parseChannelDefinition({
        format: DEFINITIONS_FORMAT,
        channelId: "dingtalk",
      }),
    ).toThrow("channelId");
  });

  it("schemas 不是对象或条目缺 fields 时报错", () => {
    expect(() =>
      parseChannelDefinition({
        format: DEFINITIONS_FORMAT,
        channelId: "douyin",
      }),
    ).toThrow("schemas");
    expect(() =>
      parseChannelDefinition({
        format: DEFINITIONS_FORMAT,
        channelId: "douyin",
        version: "2026.09",
        schemas: { "dy-text": { version: "2026.09", source: "https://x" } },
      }),
    ).toThrow("fields");
  });

  it("字段元素形状非法时报错并指出位置：path 保留名 / type 越界 / 非字符串标题", () => {
    const base = { title: "t", type: "string", group: "g", description: "d" };
    expect(() =>
      parseFieldDescriptor({ ...base, path: "__proto__.x" }, "第 1 项"),
    ).toThrow("第 1 项");
    expect(() =>
      parseFieldDescriptor({ ...base, path: "a.b", type: "float" }, "第 2 项"),
    ).toThrow("第 2 项");
    expect(() =>
      parseFieldDescriptor({ ...base, path: "a.b", title: 3 }, "第 3 项"),
    ).toThrow("第 3 项");
  });

  it("字段可选旗标（required/format/multiline）校验并归一化输出", () => {
    expect(
      parseFieldDescriptor(
        {
          path: "a.b",
          title: "t",
          type: "string",
          group: "g",
          description: "d",
          required: true,
          format: "url",
          multiline: true,
        },
        "",
      ),
    ).toEqual({
      path: "a.b",
      title: "t",
      type: "string",
      group: "g",
      description: "d",
      required: true,
      format: "url",
      multiline: true,
    });
    // required 非布尔、format 非 url 都拒绝
    expect(() =>
      parseFieldDescriptor(
        {
          path: "a.b",
          title: "t",
          type: "string",
          group: "g",
          description: "d",
          required: "yes",
        },
        "",
      ),
    ).toThrow("required");
    expect(() =>
      parseFieldDescriptor(
        {
          path: "a.b",
          title: "t",
          type: "string",
          group: "g",
          description: "d",
          format: "email",
        },
        "",
      ),
    ).toThrow("format");
  });

  it("schemaDefinition 未命中时抛出明确错误", () => {
    expect(() => schemaDefinition("missing-schema")).toThrow("未知事件模板");
  });

  it("描述文件与 schemas.ts 的版本/来源同源：schema 元数据即文件条目", () => {
    for (const schema of [...DOUYIN_EVENT_SCHEMAS, ...WECOM_EVENT_SCHEMAS]) {
      const entry = schemaDefinition(schema.id);
      expect(schema.version).toBe(entry.version);
      expect(schema.source).toBe(entry.source);
      expect(schema.fields).toEqual(entry.fields);
    }
  });

  it("既有 schema 断言依然成立：dy-text 字段序与企微字段集来自描述文件", () => {
    expect(schemaById("dy-text").fields.map((field) => field.path)[0]).toBe(
      "from_user_id",
    );
    expect(schemaById("wc-text").fields.map((field) => field.path)).toEqual([
      "ToUserName",
      "FromUserName",
      "CreateTime",
      "MsgType",
      "Content",
      "MsgId",
      "AgentID",
    ]);
  });
});
