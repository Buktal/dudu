import { describe, expect, it } from "vitest";
import { schemaById } from "../schemas";
import {
  buildDefinitionsExport,
  DEFINITIONS_EXPORT_NAME,
  parseDefinitionsImport,
} from "./io";
import { finalizeField } from "./resolve";

const dyText = schemaById("dy-text");

/** 模拟「应用说明」后的生效字段：基线两条 + 补录的未知字段一条 */
const effectiveFields = [
  dyText.fields[0],
  finalizeField({
    ...dyText.fields[4],
    title: "客人原话",
    group: "客人输入",
  }),
  finalizeField({
    path: "content.guest_id",
    title: "访客 ID",
    type: "string",
    group: "用户与身份",
    description: "补录的第三方访客标识。",
    required: true,
  }),
];

describe("导出字段定义", () => {
  it("导出带 format/schemaId/version/fields，文件名按模板 id", () => {
    const exported = buildDefinitionsExport(
      dyText.id,
      dyText.version,
      effectiveFields,
    );
    expect(exported).toEqual({
      format: "mockpulse-field-definitions-v1",
      schemaId: "dy-text",
      version: "2026.09",
      fields: effectiveFields,
    });
    expect(DEFINITIONS_EXPORT_NAME(dyText.id)).toBe(
      "mockpulse-fields-dy-text.json",
    );
  });
});

describe("导入字段定义校验", () => {
  it("导出→导入往返一致（含未知转正字段与可选旗标），版本随文件", () => {
    const exported = buildDefinitionsExport(
      dyText.id,
      dyText.version,
      effectiveFields,
    );
    // 模拟落盘再读回：JSON 序列化往返
    const raw = JSON.parse(JSON.stringify(exported)) as unknown;
    expect(parseDefinitionsImport(raw, "dy-text")).toEqual({
      version: "2026.09",
      fields: effectiveFields,
    });
  });

  it("版本缺失时按「自定义」标注", () => {
    expect(
      parseDefinitionsImport(
        {
          format: "mockpulse-field-definitions-v1",
          schemaId: "dy-text",
          fields: [],
        },
        "dy-text",
      ),
    ).toEqual({ version: "自定义", fields: [] });
  });

  it("不是对象时拒绝", () => {
    expect(() => parseDefinitionsImport("not-json-object", "dy-text")).toThrow(
      "字段定义",
    );
    expect(() => parseDefinitionsImport(null, "dy-text")).toThrow("字段定义");
  });

  it("format 不匹配给明确错误", () => {
    expect(() =>
      parseDefinitionsImport(
        { format: "other", schemaId: "dy-text", fields: [] },
        "dy-text",
      ),
    ).toThrow("mockpulse-field-definitions-v1");
  });

  it("schemaId 与当前事件不一致给明确错误", () => {
    expect(() =>
      parseDefinitionsImport(
        {
          format: "mockpulse-field-definitions-v1",
          schemaId: "wc-text",
          fields: [],
        },
        "dy-text",
      ),
    ).toThrow("不匹配");
    expect(() =>
      parseDefinitionsImport(
        {
          format: "mockpulse-field-definitions-v1",
          schemaId: "wc-text",
          fields: [],
        },
        "dy-text",
      ),
    ).toThrow("wc-text");
  });

  it("fields 缺失或不是数组时拒绝", () => {
    expect(() =>
      parseDefinitionsImport(
        { format: "mockpulse-field-definitions-v1", schemaId: "dy-text" },
        "dy-text",
      ),
    ).toThrow("fields");
    expect(() =>
      parseDefinitionsImport(
        {
          format: "mockpulse-field-definitions-v1",
          schemaId: "dy-text",
          fields: "nope",
        },
        "dy-text",
      ),
    ).toThrow("fields");
  });

  it("元素形状非法时报错并指出序号：path 保留名 / type 越界 / 缺分组", () => {
    const valid = { title: "t", group: "g", description: "d", type: "string" };
    expect(() =>
      parseDefinitionsImport(
        {
          format: "mockpulse-field-definitions-v1",
          schemaId: "dy-text",
          fields: [{ ...valid, path: "content.constructor" }],
        },
        "dy-text",
      ),
    ).toThrow("第 1 项");
    expect(() =>
      parseDefinitionsImport(
        {
          format: "mockpulse-field-definitions-v1",
          schemaId: "dy-text",
          fields: [{ ...valid, path: "a.b", type: "float64" }],
        },
        "dy-text",
      ),
    ).toThrow("第 1 项");
    expect(() =>
      parseDefinitionsImport(
        {
          format: "mockpulse-field-definitions-v1",
          schemaId: "dy-text",
          fields: [{ ...valid, path: "a.b", group: 42 }],
        },
        "dy-text",
      ),
    ).toThrow("第 1 项");
  });
});
