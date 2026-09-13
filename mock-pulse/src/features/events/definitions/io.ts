import type { FieldDescriptor } from "../schemas";
import { DEFINITIONS_FORMAT, parseFieldDescriptor } from "./loader";

/**
 * 字段定义导入/导出（#22）：字典弹窗与文件之间的数据契约。
 * 导出 = 当前生效字段（含被补录转正的未知字段）；导入 = 严格校验后
 * 载入弹窗编辑态，点「应用说明」才落库。校验失败给明确中文错误。
 */

/** 导出文件的形态：与随应用分发的渠道描述文件同一 format 标识 */
export type FieldDefinitionsExport = {
  format: string;
  schemaId: string;
  version: string;
  fields: FieldDescriptor[];
};

/** 导出文件名：mockpulse-fields-<schemaId>.json */
export function DEFINITIONS_EXPORT_NAME(schemaId: string): string {
  return `mockpulse-fields-${schemaId}.json`;
}

/** 从当前生效字段组装导出内容 */
export function buildDefinitionsExport(
  schemaId: string,
  version: string,
  fields: readonly FieldDescriptor[],
): FieldDefinitionsExport {
  return {
    format: DEFINITIONS_FORMAT,
    schemaId,
    version,
    fields: fields.map((field) => ({ ...field })),
  };
}

/**
 * 校验并解析导入的字段定义：format 匹配、schemaId 与当前事件一致、
 * fields 数组元素形状合法（path 安全、标题/含义/分组为字符串、type 枚举内）。
 * 通过则返回版本标识与归一化的字段数组（载入弹窗编辑态，点「应用说明」才落库）；
 * 任何一步不符都抛出明确中文错误。版本缺失时按「自定义」标注。
 */
export function parseDefinitionsImport(
  raw: unknown,
  currentSchemaId: string,
): { version: string; fields: FieldDescriptor[] } {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("字段定义需要是一个 JSON 对象。");
  }
  const doc = raw as Record<string, unknown>;
  if (doc.format !== DEFINITIONS_FORMAT) {
    throw new Error(
      `字段定义的格式不匹配：需要 ${DEFINITIONS_FORMAT}，实际是 ${JSON.stringify(doc.format)}。`,
    );
  }
  if (doc.schemaId !== currentSchemaId) {
    throw new Error(
      `字段定义与当前事件类型不匹配：文件是 ${JSON.stringify(doc.schemaId)}，当前是 ${currentSchemaId}。`,
    );
  }
  if (!Array.isArray(doc.fields)) {
    throw new Error("字段定义缺少 fields 数组。");
  }
  return {
    version:
      typeof doc.version === "string" && doc.version ? doc.version : "自定义",
    fields: doc.fields.map((field, index) =>
      parseFieldDescriptor(field, `第 ${index + 1} 项`),
    ),
  };
}
