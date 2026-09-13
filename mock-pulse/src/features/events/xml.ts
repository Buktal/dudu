import { has } from "lodash-es";
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

/** 语法和文本语义交给原生 XML 解析器；此分词仅定位未知元素的原文边界。 */
const XML_MARKUP_PATTERN =
  /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/?(?:[^"'<>]|"[^"]*"|'[^']*')*>/g;

function xmlDocument(text: string): XMLDocument {
  const document = new DOMParser().parseFromString(text, "application/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError?.namespaceURI) {
    throw new Error(
      "XML 格式不正确，请检查元素、转义字符及 <xml> 开头与 </xml> 结尾。",
    );
  }
  if (document.doctype) throw new Error("XML 报文不支持 DOCTYPE 声明。");
  return document;
}

function originalElements(text: string): string[] {
  const fragments: string[] = [];
  let depth = 0;
  let start = 0;
  for (const match of text.matchAll(XML_MARKUP_PATTERN)) {
    const markup = match[0];
    if (markup.startsWith("<!") || markup.startsWith("<?")) continue;
    const closing = markup.startsWith("</");
    const selfClosing = markup.endsWith("/>");
    if (!closing && depth === 1) start = match.index;
    if (closing) depth--;
    else if (!selfClosing) depth++;
    if ((closing || selfClosing) && depth === 1)
      fragments.push(text.slice(start, match.index + markup.length));
  }
  return fragments;
}

/** 拼装一行元素：已知标签按 layout 的 CDATA/行尾空格规则输出。 */
function renderElement(
  layout: XmlLayout,
  knownTags: readonly string[],
  tag: string,
  value: string,
): string {
  if (!knownTags.includes(tag) && value.trimStart().startsWith("<")) {
    // 从完整报文解析的未知元素保留原文；表单新加的文本值编码成元素。
    try {
      if (xmlDocument(value).documentElement.tagName === tag)
        return `${layout.indent}${value}`;
    } catch {
      // 不是完整 XML 元素的输入按普通文本编码。
    }
  }
  const content = layout.bareTags.includes(tag)
    ? value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    : `<![CDATA[${value.split("]]>").join("]]]]><![CDATA[>")}]]>`;
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
    if (!/^[A-Za-z_][\w.-]*$/.test(tag) || !safePath(tag))
      throw new Error(`无效的 XML 元素名：${tag}`);
    if (value == null || typeof value === "object") {
      throw new Error(`XML 元素 ${tag} 的值必须是文本。`);
    }
    lines.push(renderElement(layout, knownTags, tag, String(value)));
  }
  lines.push("</xml>");
  return lines.join("\n");
}

/**
 * XML 明文 → 载荷。支持紧凑和多行 XML，按 XML 语义解码文本与 CDATA；
 * 已知元素取文本值，未知元素保留整个原文片段。
 * 容忍 CRLF 行尾与首尾空白；结构不符时抛可读错误（完整报文页就地提示）。
 */
export function parseXmlBody(
  knownTags: readonly string[],
  text: string,
): WirePayload {
  const source = text.trim().replace(/\r\n?/g, "\n");
  const document = xmlDocument(source);
  const root = document.documentElement;
  if (root.tagName !== "xml" || root.attributes.length)
    throw new Error("报文必须以 <xml> 开头，并以 </xml> 结尾。");
  if (
    Array.from(root.childNodes).some(
      (node) =>
        (node.nodeType === Node.TEXT_NODE ||
          node.nodeType === Node.CDATA_SECTION_NODE) &&
        node.textContent?.trim(),
    )
  )
    throw new Error("报文根节点只能包含 XML 元素。");
  const fragments = originalElements(source);
  const payload: WirePayload = {};
  for (const [index, element] of Array.from(root.children).entries()) {
    const tag = element.tagName;
    if (!/^[A-Za-z_][\w.-]*$/.test(tag))
      throw new Error(`无效的 XML 元素名：${tag}`);
    if (!safePath(tag)) {
      throw new Error(`报文包含保留字段名：${tag}`);
    }
    if (has(payload, [tag])) throw new Error(`报文包含重复元素：${tag}`);
    if (knownTags.includes(tag)) {
      if (element.children.length || element.attributes.length)
        throw new Error(`XML 元素 ${tag} 必须为文本，不能包含子元素或属性。`);
      payload[tag] = element.textContent ?? "";
    } else {
      payload[tag] = fragments[index];
    }
  }
  return payload;
}
