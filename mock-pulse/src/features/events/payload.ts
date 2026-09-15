import { buildFormBody, parseFormBody } from "./form";
import { keyParts, safePath } from "./paths";
import type { EventSchema, WireForm, WirePayload } from "./schemas";
import { buildXmlBody, parseXmlBody } from "./xml";

/**
 * 报文载荷领域逻辑：路径读写、叶子展开、表单/线上双向转换、
 * 发送者 ID 同步。全部为纯函数。
 * 线上形态按 schema.wire 分发：抖音 JSON（紧凑序列化）、企微 XML（确定性
 * 拼装）、美团 form（确定性拼装，./form 单点）。
 * 路径工具（keyParts/safePath）见 ./paths，各模块直接导入；
 * 表单字段解析（描述符 ∪ 载荷叶子 + 用户定义合并）见 ./definitions/resolve。
 */

/**
 * 载荷深拷贝：载荷是 JSON 契约值（经 Rust serde_json 往返），
 * 用 JSON 克隆以兼容 Immer 代理（structuredClone 无法克隆 Proxy）。
 */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function getAt(obj: unknown, path: string): unknown {
  return keyParts(path).reduce<unknown>(
    (value, key) =>
      value != null && typeof value === "object"
        ? (value as Record<string, unknown>)[key]
        : undefined,
    obj,
  );
}

/** 剧本卡片展示消息内容，完整载荷仍由版本与运行快照保存。 */
export function payloadPreview(
  schema: EventSchema,
  payload: WirePayload,
): string {
  const fields = editorPayload(schema, payload);
  for (const path of ["content.text", "Content", "message"]) {
    const value = getAt(fields, path);
    if (typeof value === "string" && value) return value;
  }
  if (fields.Event === "click") return `点击菜单 ${fields.EventKey ?? ""}`;
  if (fields.event === "im_enter_direct_msg") return "用户从主页进入私信会话";
  if (getAt(fields, "content.message_type") === "image") return "[图片消息]";
  return schema.name;
}

/** XML 元素值谓词：元素值只能是文本/数字/布尔，null 与对象（含数组）不合法。
 *  withCustomField 与 parseFieldText 共用此单点判断（各自保留用户可见文案）。 */
function isXmlNonScalar(value: unknown): boolean {
  return value == null || typeof value === "object";
}

export function withCustomField(
  schema: EventSchema,
  payload: WirePayload,
  path: string,
  value: unknown,
): WirePayload {
  const key = path.trim();
  if (!key || !safePath(key)) throw new Error("请填写有效的字段路径。");
  if (schema.wire === "xml") {
    if (!/^[A-Za-z_][\w.-]*$/.test(key))
      throw new Error("XML 参数名须为单个元素名。");
    if (isXmlNonScalar(value))
      throw new Error("XML 参数值须为文本、数字或布尔值。");
    return { ...cloneJson(payload), [key]: String(value) };
  }
  if (schema.wire === "form") {
    // form 模板载荷为扁平 kv：字段名单层、值不收 null（对象/数组拼装时
    // JSON 字符串化，见 ./form）
    if (!/^[A-Za-z_][\w.-]*$/.test(key))
      throw new Error("表单参数名须为单个字段名。");
    if (value == null) throw new Error("表单参数值不能为空。");
    return { ...cloneJson(payload), [key]: value };
  }
  return setPayloadField(payload, key, value);
}

/**
 * 字段文本 → 类型化值（编辑器字段输入的单点转换，editFieldText 消费）：
 * - number：Number 强转，空白或非有限值报「请输入有效数字。」；
 * - json / boolean：JSON.parse，解析错误原样抛出（调用方落为字段错误）；
 * - 其余类型：文本透传。
 * XML 模板（wire === "xml"）下 null/对象不能作元素值，与 withCustomField
 * 共用同一谓词；两处报错文案沿用各自措辞。
 */
export function parseFieldText(
  type: string,
  text: string,
  wire: WireForm,
): unknown {
  const value =
    type === "number"
      ? Number(text)
      : type === "json" || type === "boolean"
        ? JSON.parse(text)
        : text;
  if (type === "number" && (!text.trim() || !Number.isFinite(value)))
    throw new Error("请输入有效数字。");
  if (wire === "xml" && isXmlNonScalar(value))
    throw new Error("XML 元素的值必须是文本。");
  return value;
}

/** 沿路径写入值；中间层缺失时按下一键是否数字创建数组或对象。 */
export function setAt(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  if (!safePath(path)) {
    throw new Error(`字段路径不能包含保留名称：${path}`);
  }
  const keys = keyParts(path);
  let current: Record<string, unknown> = obj;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      current[key] = value;
      return;
    }
    const next = current[key];
    if (next == null || typeof next !== "object") {
      current[key] = /^\d+$/.test(keys[index + 1]) ? [] : {};
    }
    current = current[key] as Record<string, unknown>;
  });
}

export type PayloadLeaf = {
  path: string;
  value: unknown;
};

/** 展开载荷到叶子（原始值/空容器终止），路径含数组下标。 */
export function flattenPayload(
  value: unknown,
  prefix = "",
  out: PayloadLeaf[] = [],
): PayloadLeaf[] {
  if (
    value != null &&
    typeof value === "object" &&
    Object.keys(value).length > 0
  ) {
    for (const [key, child] of Object.entries(value)) {
      const path = Array.isArray(value)
        ? `${prefix}[${key}]`
        : prefix
          ? `${prefix}.${key}`
          : key;
      flattenPayload(child, path, out);
    }
  } else if (prefix) {
    out.push({ path: prefix, value });
  }
  return out;
}

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

/**
 * 直发明文：按 schema.wire 产出逐字节稳定的报文文本。
 *
 * 键序规则（定死）：报文键序一律取载荷文档序——
 * - 模板载荷即官方黄金样本的文档序（事件信封在前，未知官方字段按原文位置）；
 * - 编辑新增字段按插入位置追加；JSON/持久化往返按文档序保序
 *   （Rust 端 serde_json 开启 preserve_order，见 src-tauri/Cargo.toml）。
 * - 抖音（json）：JSON.stringify 紧凑无空格（UTF-8 原文，不转义非 ASCII）。
 * - 企微（xml）：确定性 XML 拼装（元素序 = 文档序，CDATA/排版按 xmlLayout）。
 * - 美团（form）：确定性 form 拼装（字段序 = 文档序，./form 单点；
 *   官方推送参数未排序，签名排序由渠道适配器负责）。
 */
export function wireBodyText(
  schema: EventSchema,
  payload: WirePayload,
): string {
  if (schema.wire === "xml") {
    return buildXmlBody(
      requireXmlLayout(schema),
      schema.fields.map((field) => field.path),
      payload,
    );
  }
  if (schema.wire === "form") {
    return buildFormBody(wirePayload(schema, payload));
  }
  return JSON.stringify(wirePayload(schema, payload));
}

/**
 * 完整报文页的编辑文本：JSON 模板为 2 空格缩进；XML/form 模板即线上明文
 * 原文（form 报文天然单行，预览即发送字节）。
 */
export function wireDraftText(
  schema: EventSchema,
  payload: WirePayload,
): string {
  if (schema.wire === "xml" || schema.wire === "form") {
    return wireBodyText(schema, payload);
  }
  return JSON.stringify(wirePayload(schema, payload), null, 2);
}

/** 完整报文文本 → 载荷（JSON 对象/XML 扁平元素/form 扁平字段三形态）。 */
export function parseWireDraft(schema: EventSchema, text: string): WirePayload {
  if (schema.wire === "xml") {
    return parseXmlBody(
      schema.fields.map((field) => field.path),
      text,
    );
  }
  if (schema.wire === "form") {
    return parseFormBody(text);
  }
  return parseWirePayload(text);
}

function requireXmlLayout(schema: EventSchema) {
  if (!schema.xmlLayout) {
    throw new Error(`模板 ${schema.id} 缺少 XML 排版规则。`);
  }
  return schema.xmlLayout;
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

/** 表单中修改一个字段（在表单载荷上操作，返回新载荷）。 */
export function setPayloadField(
  payload: WirePayload,
  path: string,
  value: unknown,
): WirePayload {
  const draft = cloneJson(payload);
  setAt(draft, path, value);
  return draft;
}

/**
 * 发送者 ID 显式同步：把资料的 open_id 对齐到 from_user_id。
 * 入参与返回均为表单形态载荷（contentString 已解析）；返回新载荷，
 * 路径不存在时原样返回同一引用。
 */
export function syncSenderIdentity(
  schema: EventSchema,
  payload: WirePayload,
): WirePayload {
  const profilePath = schema.fields
    .map((field) => field.path)
    .find(
      (path) =>
        path.includes("user_infos") &&
        path.endsWith(".open_id") &&
        getAt(payload, path) !== undefined,
    );
  const sender = getAt(payload, "from_user_id");
  if (!profilePath || sender === undefined) {
    return payload;
  }
  return setPayloadField(payload, profilePath, sender);
}
