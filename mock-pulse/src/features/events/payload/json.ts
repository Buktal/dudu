import { cloneJson, flattenPayload, safePath } from "../paths";
import type { EventSchema, WirePayload } from "../schemas";

/**
 * JSON 线上形态分支（抖音等 wire === "json" 模板的拼装/解析单点）：
 * contentString 转换（editorPayload / wirePayload）与 JSON 校验收敛于此，
 * payload.ts 的 wireBodyText / wireDraftText / parseWireDraft 只做分发。
 * 键序规则见 payload.ts wireBodyText（载荷文档序 + Rust preserve_order）。
 */

/**
 * contentString 模板专用转换（editorPayload / wirePayload / applyGeneratedIds
 * 共用的单点实现）：
 * - parse：线上 JSON 字符串 → 对象；非法 JSON 原样返回（完整报文页可修）
 * - stringify：对象 → 线上 JSON 字符串；非对象原样返回
 */
export function parseContentString(
  schema: EventSchema,
  content: unknown,
): unknown {
  if (schema.contentString && typeof content === "string") {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }
  return content;
}

export function stringifyContentString(
  schema: EventSchema,
  content: unknown,
): unknown {
  if (schema.contentString && content != null && typeof content === "object") {
    return JSON.stringify(content);
  }
  return content;
}

/** 表单编辑用的载荷：contentString 模板把 content 字符串解析为对象。 */
export function editorPayload(
  schema: EventSchema,
  payload: WirePayload,
): WirePayload {
  const draft = cloneJson(payload);
  // 仅当载荷确有 content 键时转换（XML 模板无 content，不能造出 undefined 键）
  if ("content" in draft) {
    draft.content = parseContentString(schema, draft.content);
  }
  return draft;
}

/** 线上发送用的载荷：contentString 模板把 content 对象序列化回字符串。 */
export function wirePayload(
  schema: EventSchema,
  payload: WirePayload,
): WirePayload {
  const draft = cloneJson(payload);
  if ("content" in draft) {
    draft.content = stringifyContentString(schema, draft.content);
  }
  return draft;
}

/** JSON 分支的线上明文：紧凑序列化（UTF-8 原文，不转义非 ASCII）。 */
export function jsonWireText(
  schema: EventSchema,
  payload: WirePayload,
): string {
  return JSON.stringify(wirePayload(schema, payload));
}

/** JSON 分支的完整报文页编辑文本：2 空格缩进。 */
export function jsonDraftText(
  schema: EventSchema,
  payload: WirePayload,
): string {
  return JSON.stringify(wirePayload(schema, payload), null, 2);
}

/** 完整报文文本 → 载荷（JSON 校验：最外层必须是对象，路径安全）。 */
export function parseWirePayload(text: string): WirePayload {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("报文不是合法的 JSON。");
  }
  if (data == null || Array.isArray(data) || typeof data !== "object") {
    throw new Error("报文最外层必须是对象。");
  }
  if (flattenPayload(data).some((leaf) => !safePath(leaf.path))) {
    throw new Error("报文包含保留字段名。");
  }
  return cloneJson(data) as WirePayload;
}
