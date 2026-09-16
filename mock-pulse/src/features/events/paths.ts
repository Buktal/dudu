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
