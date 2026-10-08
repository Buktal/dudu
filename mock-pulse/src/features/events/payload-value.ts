/**
 * 载荷值工具：JSON 契约值的深拷贝与叶子展开（wire 形态无关的纯函数）。
 * 归位（评审 C1）：cloneJson / flattenPayload 不做路径读写，原与路径安全
 * 工具同住 paths 名以偏概全，拆出至名实相符的本模块；路径安全（safePath）
 * 与扁平字段名单点（WIRE_FIELD_PATTERN）仍留 paths。
 */

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
