/** 载荷点路径与键安全工具：JSON 与 XML 载荷共用（leaf 模块）。 */

import { toPath } from "lodash-es";

const RESERVED_KEYS = ["__proto__", "prototype", "constructor"];

/**
 * 路径安全守卫：任一段为保留名称即拒绝（写侧防原型污染，读侧配合
 * payload.getAt 防原型穿透）。段解析用 lodash toPath：
 * "content.user_infos[0].open_id" → ["content","user_infos","0","open_id"]；
 * 引号语法（a["__proto__"] 等）同样解析出保留名并拦截。
 */
export function safePath(path: string): boolean {
  if (!path) return false;
  return toPath(path).every((key) => !RESERVED_KEYS.includes(key));
}

/**
 * 扁平字段名单点约束（form 字段名 / XML 元素名 / withCustomField 自定义
 * 字段三处共用；\w 为 ASCII 词字符）。此前三处逐字重复，收敛至此一处，
 * form.ts 与 xml.ts 的拼装/解析守卫、payload.ts 的自定义字段校验均导入。
 */
export const WIRE_FIELD_PATTERN = /^[A-Za-z_][\w.-]*$/;

/**
 * 载荷深拷贝：载荷是 JSON 契约值（经 Rust serde_json 往返），
 * 用 JSON 克隆以兼容 Immer 代理（structuredClone 无法克隆 Proxy）。
 */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
