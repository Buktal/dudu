/** 载荷点路径安全与扁平字段名单点约束：JSON 与 XML 载荷共用（leaf 模块）。 */

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
 * codec 的拼装/解析守卫、payload.ts 的自定义字段校验均导入。
 */
export const WIRE_FIELD_PATTERN = /^[A-Za-z_][\w.-]*$/;
