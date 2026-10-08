import { buildXmlBody, parseXmlBody } from "../codec/xml";
import type { EventSchema, WirePayload } from "../schemas";

/**
 * XML 线上形态分支（企微等 wire === "xml" 模板的 schema 感知 adapter）：
 * 确定性拼装与解析的字节语义单点在 ../codec/xml（buildXmlBody /
 * parseXmlBody），此处只做 schema 感知的排版规则装载（xmlLayout 缺失即炸）
 * 与已知元素集供给。
 */
function requireXmlLayout(schema: EventSchema) {
  if (!schema.xmlLayout) {
    throw new Error(`模板 ${schema.id} 缺少 XML 排版规则。`);
  }
  return schema.xmlLayout;
}

function knownTagsOf(schema: EventSchema): string[] {
  return schema.fields.map((field) => field.path);
}

export function xmlWireText(schema: EventSchema, payload: WirePayload): string {
  return buildXmlBody(requireXmlLayout(schema), knownTagsOf(schema), payload);
}

export function parseXmlDraft(schema: EventSchema, text: string): WirePayload {
  return parseXmlBody(knownTagsOf(schema), text);
}
