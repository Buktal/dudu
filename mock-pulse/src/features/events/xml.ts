import { safePath } from "./paths";
import type { WirePayload, XmlLayout } from "./schemas";

/**
 * 企微 XML 载荷的确定性拼装与解析（纯函数）。
 * 载荷模型：扁平对象，键 = XML 元素名（文档序，serde_json preserve_order
 * 保证跨 Rust 持久化往返键序不变），值 = 元素文本。
 * - 已知元素（描述符声明过）：按 layout 规则输出——裸文本或 CDATA，
 *   排版逐字复现官方样本（缩进/行尾空格为官方原文形态）；
 * - 未知元素：值即原文片段（完整元素文本），拼装时原样回填，
 *   保真用户在完整报文页手工增补的官方未收录元素。
 */

/** 单行扁平元素（可带 CDATA）：<tag>text</tag> 或 <tag><![CDATA[text]]></tag> */
const ELEMENT_PATTERN =
  /^<([A-Za-z_][\w.-]*?)(?:\s[^>]*)?>(<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/\1>$/;

/** 拼装一行元素：已知标签按 layout 的 CDATA/行尾空格规则输出。 */
function renderElement(
  layout: XmlLayout,
  knownTags: readonly string[],
  tag: string,
  value: string,
): string {
  if (!knownTags.includes(tag)) {
    // 未知元素：原文片段逐字保留（不重排、不重打 CDATA）
    return `${layout.indent}${value}`;
  }
  const content = layout.bareTags.includes(tag)
    ? value
    : `<![CDATA[${value}]]>`;
  const suffix = layout.trailingSpaceTags?.includes(tag) ? " " : "";
  return `${layout.indent}<${tag}>${content}</${tag}>${suffix}`;
}

/**
 * 载荷 → XML 明文（确定性：同输入同输出逐字节一致）。
 * 结构定死：<xml> 起始行 + 每元素一行 + </xml> 结束行，行间 \n、无结尾换行。
 */
export function buildXmlBody(
  layout: XmlLayout,
  knownTags: readonly string[],
  payload: WirePayload,
): string {
  const lines = ["<xml>"];
  for (const [tag, value] of Object.entries(payload)) {
    if (value == null || typeof value === "object") {
      throw new Error(`XML 元素 ${tag} 的值必须是文本。`);
    }
    lines.push(renderElement(layout, knownTags, tag, String(value)));
  }
  lines.push("</xml>");
  return lines.join("\n");
}

/**
 * XML 明文 → 载荷。结构约定（与 buildXmlBody 对偶）：首行 <xml>、末行 </xml>、
 * 中间每行恰为一个扁平元素；已知元素取文本值，未知元素保留整行原文片段。
 * 容忍 CRLF 行尾与首尾空白；结构不符时抛可读错误（完整报文页就地提示）。
 */
export function parseXmlBody(
  knownTags: readonly string[],
  text: string,
): WirePayload {
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\r$/, "").trim())
    .filter((line) => line !== "");
  if (lines.shift() !== "<xml>") {
    throw new Error("报文必须以 <xml> 开头。");
  }
  if (lines.pop() !== "</xml>") {
    throw new Error("报文必须以 </xml> 结尾，且中间每行一个元素。");
  }
  const payload: WirePayload = {};
  for (const line of lines) {
    const match = ELEMENT_PATTERN.exec(line);
    if (!match) {
      throw new Error(`这一行不是扁平元素：${line}`);
    }
    const [, tag, , cdataText, rawText] = match;
    if (!safePath(tag)) {
      throw new Error(`报文包含保留字段名：${tag}`);
    }
    payload[tag] = knownTags.includes(tag) ? (cdataText ?? rawText) : line;
  }
  return payload;
}
