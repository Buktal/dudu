import { safePath } from "../paths";
import { cloneJson, flattenPayload } from "../payload-value";
import type { WirePayload } from "../schemas";

/**
 * JSON 载荷的字节编解码单点（评审 C1 归位 codec/，不依赖 EventSchema，
 * 与 ./form、./xml 同层）：紧凑序列化（wire 字节）与线上文本校验解析。
 * schema 感知的
 * contentString 往返与完整报文页编辑文本（2 空格缩进）住 ../payload/json，
 * payload.ts 的 wireBodyText / parseWireDraft 只做分发。
 * 键序规则见 payload.ts wireBodyText（载荷文档序 + Rust preserve_order）。
 */

/**
 * 载荷 → JSON 明文（确定性：紧凑序列化，UTF-8 原文不转义非 ASCII，
 * 同输入同输出逐字节一致）。
 */
export function buildJsonBody(payload: WirePayload): string {
  return JSON.stringify(payload);
}

/** 线上 JSON 文本 → 载荷（校验：最外层必须是对象，路径安全）。 */
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
