import { buildFormBody, parseFormBody } from "../codec/form";
import type { EventSchema, WirePayload } from "../schemas";
import { wirePayload } from "./json";

/**
 * form 线上形态分支（美团等 wire === "form" 模板的 schema 感知 adapter）：
 * 确定性拼装与解析的字节语义单点在 ../codec/form（buildFormBody /
 * parseFormBody，Rust 侧美团适配器对拍 util::form_encode_value /
 * percent_decode），此处只做 schema 感知的 contentString 往返（与 json
 * 分支同形）。
 */
export function formWireText(
  schema: EventSchema,
  payload: WirePayload,
): string {
  return buildFormBody(wirePayload(schema, payload));
}

export function parseFormDraft(text: string): WirePayload {
  return parseFormBody(text);
}
