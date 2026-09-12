/** 载荷点路径与键安全工具：JSON 与 XML 载荷共用（leaf 模块，无依赖）。 */

const RESERVED_KEYS = ["__proto__", "prototype", "constructor"];

/** "content.user_infos[0].open_id" → ["content","user_infos","0","open_id"] */
export function keyParts(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
}

export function safePath(path: string): boolean {
  if (!path) return false;
  return keyParts(path).every((key) => !RESERVED_KEYS.includes(key));
}
