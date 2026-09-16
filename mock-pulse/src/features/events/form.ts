import { safePath } from "./paths";
import type { WirePayload } from "./schemas";

/**
 * form 载荷的确定性拼装与解析（纯函数）——form 线上形态
 * （application/x-www-form-urlencoded）的拼装单点，与 xml.ts 同层。
 * 载荷模型：扁平对象，键 = 表单字段名（文档序，serde_json preserve_order
 * 保证跨 Rust 持久化往返键序不变），值 = 文本/数字/布尔标量或 JSON 结构。
 * - 标量按文本输出；对象/数组先 JSON.stringify 再作字段值（表单渠道官方
 *   口径：「对象/数组先转 JSON 字符串再作 form 字段」，事实库 meituan §3.1）
 * - URL 编码语义（本模块单点定义，Rust 侧美团适配器按同一语义对拍）：
 *   编码 = RFC 3986 非保留字集（A-Za-z0-9 与 - _ . ~）之外逐字节百分号
 *   编码（大写 hex、UTF-8 字节序）；解码 = %XX 还原字节 + 「+」还原空格
 *   （form 惯例）。签名吃原文值的规则由各渠道适配器负责，本模块只管线
 *   上字节。
 * - 解析侧对以 [ / { 开头且 JSON 可解析的字段值还原为 JSON 结构（拼装时
 *   「对象/数组 → JSON 字符串」的逆变换），其余值保持文本——美团
 *   backup_recipient_phone 等数组字段即以 JSON 结构进出编辑器。
 */

/** 表单字段名：单个字段名（与 XML 元素名同族约束；\w 为 ASCII 词字符） */
const FORM_FIELD_PATTERN = /^[A-Za-z_][\w.-]*$/;

/**
 * 单值百分号编码：非保留字原样，其余按 UTF-8 字节输出大写 %XX。
 * 标准编码走 encodeURIComponent 组合：其不编码集恰为 RFC 3986 非保留字集
 * 加 `!'()*` 六字符（本规范要求照编码），replace 补上这六字符即逐字节等价
 * （RFC 3986 大写 hex、UTF-8 字节序均为 encodeURIComponent 的规范行为）；
 * URLSearchParams 序列化把空格写「+」且编码集不同，不可用。Rust 侧同一
 * 语义单点换 percent-encoding crate（util::form_encode_value），两端对拍。
 */
export function formEncodeValue(text: string): string {
  return encodeURIComponent(text).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * 单值百分号解码：%XX 还原字节（非法序列报可读错误）、「+」还原空格。
 * 为何不用标准 API（本轮重判，与 Rust 侧 util::percent_decode 同注）：
 * decodeURIComponent 配合「+」前置 replace 虽可覆盖合法输入，但它对「坏
 * % 序列」与「坏 UTF-8 字节序」同报单一 URIError，无法区分下方两条各有
 * 测试锚定的可读错误，孤代理等边缘字节序行为亦有漂移；URLSearchParams
 * 只解析整段 query（按 &/= 切分），没有单值入口且对空段/非法序列静默
 * 容忍。按「同一字节语义单点」的铁律（两端同换或同不换），解码端两侧都
 * 保留手写；编码端已随本轮换 API 组合/percent-encoding。
 */
export function formDecodeValue(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const out: number[] = [];
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    if (byte === 0x25) {
      const hex = String.fromCharCode(
        bytes[index + 1] ?? 0,
        bytes[index + 2] ?? 0,
      );
      if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
        throw new Error("报文包含不合法的百分号编码。");
      }
      out.push(Number.parseInt(hex, 16));
      index += 2;
    } else if (byte === 0x2b) {
      out.push(0x20);
    } else {
      out.push(byte);
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      new Uint8Array(out),
    );
  } catch {
    throw new Error("报文的百分号编码不是合法的 UTF-8 字节序。");
  }
}

/** 字段值 → 线上文本：标量按文本；对象/数组先 JSON.stringify（官方口径）。 */
function wireValueText(value: unknown): string {
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** 线上文本 → 字段值：以 [ / { 开头且 JSON 可解析的还原为 JSON 结构。 */
function payloadValueOf(text: string): unknown {
  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function assertFieldName(key: string): void {
  if (!FORM_FIELD_PATTERN.test(key) || !safePath(key)) {
    throw new Error(`无效的表单字段名：${key}`);
  }
}

/**
 * 载荷 → form 明文（确定性：同输入同输出逐字节一致）。
 * 结构定死：`key=value` 以 `&` 连接的单行文本，键序 = 载荷文档序
 * （官方推送参数未排序，排序只发生在签名计算，由渠道适配器负责）。
 */
export function buildFormBody(payload: WirePayload): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    assertFieldName(key);
    if (value == null) {
      throw new Error(`表单字段 ${key} 的值不能为空。`);
    }
    pairs.push(
      `${formEncodeValue(key)}=${formEncodeValue(wireValueText(value))}`,
    );
  }
  return pairs.join("&");
}

/**
 * form 明文 → 载荷。容忍首尾空白；无值参数（`key` 或 `key=`）落空串
 * （官方「没有值的参数也需拼接」形态）；重复字段名抛可读错误。
 */
export function parseFormBody(text: string): WirePayload {
  const source = text.trim();
  if (source === "") {
    throw new Error("报文不是合法的表单报文：内容为空。");
  }
  const payload: WirePayload = {};
  for (const pair of source.split("&")) {
    if (pair === "") {
      throw new Error("报文包含空字段（连续的 &）。");
    }
    const eq = pair.indexOf("=");
    const key = formDecodeValue(eq === -1 ? pair : pair.slice(0, eq));
    assertFieldName(key);
    if (key in payload) {
      throw new Error(`报文包含重复字段：${key}`);
    }
    payload[key] = payloadValueOf(
      formDecodeValue(eq === -1 ? "" : pair.slice(eq + 1)),
    );
  }
  return payload;
}
