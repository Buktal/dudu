import { type ChannelId, isChannelId } from "@/lib/channels";

import { safePath } from "../paths";
import type { FieldDescriptor, FieldType } from "../schemas";

/**
 * 版本化渠道字段描述文件的装载契约（#22 → #27）：每渠道一份 JSON 随应用分发，
 * 由该渠道的协议元数据模块（schemas/<channel>.ts）在装载时调用 parseChannelDefinition
 * 校验——文件是数据契约，坏了要在启动时炸出明确错误，
 * 而不是让表单拿到半瘸的说明。导入字段定义（字典弹窗）复用同一套字段校验。
 */

/** 字段定义交换格式标识（导出/导入/随应用分发的描述文件共用） */
export const DEFINITIONS_FORMAT = "mockpulse-field-definitions-v1";

/** 描述文件中单个事件模板的字段定义条目 */
export type SchemaDefinition = {
  /** 描述符版本标识 */
  version: string;
  /** 字段定义来源（官方文档 URL） */
  source: string;
  fields: FieldDescriptor[];
};

/** 一份渠道描述文件的形态 */
export type ChannelDefinition = {
  format: string;
  channelId: ChannelId;
  /** 渠道文件级版本：所有模板版本的汇总标识 */
  version: string;
  schemas: Record<string, SchemaDefinition>;
};

const FIELD_TYPES: readonly FieldType[] = [
  "string",
  "number",
  "boolean",
  "json",
  "numberString",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

/**
 * 校验并归一化单个字段描述：path 安全、标题/含义/分组为字符串、type 在枚举内，
 * 可选旗标 required/format/multiline 类型正确。where 用于错误定位（如「第 3 项」）。
 * 输出只保留已知键，杜绝多余字段混进契约。
 */
export function parseFieldDescriptor(
  raw: unknown,
  where: string,
): FieldDescriptor {
  const label = where ? `${where}字段` : "字段";
  if (!isRecord(raw)) {
    throw new Error(`${label}定义需要是对象。`);
  }
  const { path, title, type, group, description } = raw;
  if (typeof path !== "string" || !path || !safePath(path)) {
    throw new Error(`${label}的 path 不合法：${JSON.stringify(path)}`);
  }
  if (typeof title !== "string") {
    throw new Error(`${label}（${path}）的 title 需要是字符串。`);
  }
  if (typeof group !== "string") {
    throw new Error(`${label}（${path}）的 group 需要是字符串。`);
  }
  if (typeof description !== "string") {
    throw new Error(`${label}（${path}）的 description 需要是字符串。`);
  }
  if (typeof type !== "string" || !FIELD_TYPES.includes(type as FieldType)) {
    throw new Error(
      `${label}（${path}）的 type 需要是 ${FIELD_TYPES.join("/")} 之一。`,
    );
  }
  const descriptor: FieldDescriptor = {
    path,
    title,
    type: type as FieldType,
    group,
    description,
  };
  if (raw.required !== undefined) {
    if (typeof raw.required !== "boolean") {
      throw new Error(`${label}（${path}）的 required 需要是布尔值。`);
    }
    if (raw.required) {
      descriptor.required = true;
    }
  }
  if (raw.format !== undefined) {
    if (raw.format !== "url") {
      throw new Error(`${label}（${path}）的 format 只支持 url。`);
    }
    descriptor.format = "url";
  }
  if (raw.multiline !== undefined) {
    if (typeof raw.multiline !== "boolean") {
      throw new Error(`${label}（${path}）的 multiline 需要是布尔值。`);
    }
    if (raw.multiline) {
      descriptor.multiline = true;
    }
  }
  return descriptor;
}

/**
 * 校验并解析一份渠道描述文件：format 匹配、channelId 在注册表内、
 * schemas 为对象且每个条目含版本/来源/合法字段数组。
 */
export function parseChannelDefinition(raw: unknown): ChannelDefinition {
  if (!isRecord(raw)) {
    throw new Error("渠道字段定义需要是对象。");
  }
  if (raw.format !== DEFINITIONS_FORMAT) {
    throw new Error(
      `渠道字段定义的 format 需要是 ${DEFINITIONS_FORMAT}，实际是 ${JSON.stringify(raw.format)}。`,
    );
  }
  if (!isChannelId(raw.channelId)) {
    throw new Error(
      `渠道字段定义的 channelId 不在渠道注册表内：${JSON.stringify(raw.channelId)}。`,
    );
  }
  if (!isRecord(raw.schemas)) {
    throw new Error("渠道字段定义缺少 schemas 对象。");
  }
  const schemas: Record<string, SchemaDefinition> = {};
  for (const [schemaId, entry] of Object.entries(raw.schemas)) {
    if (!isRecord(entry)) {
      throw new Error(`模板 ${schemaId} 的字段定义需要是对象。`);
    }
    if (typeof entry.version !== "string" || !entry.version) {
      throw new Error(`模板 ${schemaId} 的字段定义缺少版本标识 version。`);
    }
    if (typeof entry.source !== "string" || !entry.source) {
      throw new Error(`模板 ${schemaId} 的字段定义缺少来源 source。`);
    }
    if (!Array.isArray(entry.fields)) {
      throw new Error(`模板 ${schemaId} 的字段定义缺少 fields 数组。`);
    }
    schemas[schemaId] = {
      version: entry.version,
      source: entry.source,
      fields: entry.fields.map((field, index) =>
        parseFieldDescriptor(field, `第 ${index + 1} 项`),
      ),
    };
  }
  return {
    format: raw.format,
    channelId: raw.channelId,
    version:
      typeof raw.version === "string" && raw.version
        ? raw.version
        : "未标注版本",
    schemas,
  };
}

/**
 * 多份同渠道描述文件合并（按推送体系分文件分发的渠道，如抖音 #30）：
 * format/channelId/version 必须一致，schema 条目按文件序合并、id 不得重复
 * （重复说明分文件间脱节，装载即炸）。
 */
export function mergeChannelDefinitions(
  parts: readonly ChannelDefinition[],
): ChannelDefinition {
  const [first] = parts;
  if (!first) {
    throw new Error("渠道字段定义至少需要一份分文件。");
  }
  const schemas: Record<string, SchemaDefinition> = {};
  for (const part of parts) {
    if (part.format !== first.format || part.channelId !== first.channelId) {
      throw new Error(
        `渠道字段定义分文件的 format/channelId 不一致：${part.channelId} 与 ${first.channelId}。`,
      );
    }
    if (part.version !== first.version) {
      throw new Error(
        `渠道字段定义分文件的版本不一致：${part.version} 与 ${first.version}。`,
      );
    }
    for (const [schemaId, entry] of Object.entries(part.schemas)) {
      if (schemas[schemaId]) {
        throw new Error(`模板 ${schemaId} 在描述文件分文件中重复定义。`);
      }
      schemas[schemaId] = entry;
    }
  }
  return { ...first, schemas };
}
