import { describe, expect, it } from "vitest";

import {
  DEFINITIONS_FORMAT,
  parseChannelDefinition,
  parseFieldDescriptor,
} from "./loader";

describe("渠道描述文件解析（带类型校验的 loader）", () => {
  it("parseChannelDefinition 校验合法文件：format/channelId/版本/条目齐全", () => {
    const parsed = parseChannelDefinition({
      format: DEFINITIONS_FORMAT,
      channelId: "douyin",
      version: "2026.09",
      schemas: {
        "dy-text": {
          version: "2026.09",
          source: "https://developer.open-douyin.com/docs",
          fields: [
            {
              path: "from_user_id",
              title: "发送用户 ID",
              type: "string",
              group: "用户与身份",
              description: "发送方的 open_id。",
              required: true,
            },
          ],
        },
      },
    });
    expect(parsed.format).toBe(DEFINITIONS_FORMAT);
    expect(parsed.format).toBe("mockpulse-field-definitions-v1");
    expect(parsed.channelId).toBe("douyin");
    expect(parsed.version).toBe("2026.09");
    expect(Object.keys(parsed.schemas)).toEqual(["dy-text"]);
    expect(parsed.schemas["dy-text"]?.fields[0]?.required).toBe(true);
  });

  it("format 不匹配时报错并指出需要的格式", () => {
    expect(() =>
      parseChannelDefinition({ format: "other-v2", channelId: "douyin" }),
    ).toThrow("mockpulse-field-definitions-v1");
  });

  it("channelId 不在渠道注册表时报错（知乎未入表，同样拒绝）", () => {
    expect(() =>
      parseChannelDefinition({
        format: DEFINITIONS_FORMAT,
        channelId: "zhihu",
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

  it("条目缺版本或来源时报错", () => {
    expect(() =>
      parseChannelDefinition({
        format: DEFINITIONS_FORMAT,
        channelId: "douyin",
        schemas: { "dy-text": { source: "https://x", fields: [] } },
      }),
    ).toThrow("version");
    expect(() =>
      parseChannelDefinition({
        format: DEFINITIONS_FORMAT,
        channelId: "douyin",
        schemas: { "dy-text": { version: "2026.09", fields: [] } },
      }),
    ).toThrow("source");
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
});
