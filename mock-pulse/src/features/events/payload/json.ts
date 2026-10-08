import { buildJsonBody } from "../codec/json";
import { cloneJson } from "../payload-value";
import type { EventSchema, WirePayload } from "../schemas";

/**
 * JSON 线上形态分支（抖音等 wire === "json" 模板的 schema 感知 adapter）：
 * contentString 转换（editorPayload / wirePayload）与分支文本出口收敛于此，
 * payload.ts 的 wireBodyText / wireDraftText / parseWireDraft 只做分发。
 * 线上字节的编解码单点在 ../codec/json（buildJsonBody / parseWirePayload，
 * 评审 C1 归位）；完整报文页编辑文本（2 空格缩进）是展示文本非线上字节，
 * 留在本分支。键序规则见 payload.ts wireBodyText（载荷文档序 +
 * Rust preserve_order）。
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

/** JSON 分支的线上明文：紧凑序列化（字节语义单点在 ../codec/json）。 */
export function jsonWireText(
  schema: EventSchema,
  payload: WirePayload,
): string {
  return buildJsonBody(wirePayload(schema, payload));
}

/** JSON 分支的完整报文页编辑文本：2 空格缩进。 */
export function jsonDraftText(
  schema: EventSchema,
  payload: WirePayload,
): string {
  return JSON.stringify(wirePayload(schema, payload), null, 2);
}
