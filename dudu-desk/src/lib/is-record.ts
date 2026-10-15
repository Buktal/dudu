/**
 * 未知值是否为普通对象：HTTP 响应与本地存储等外部输入做字段读取前的统一判型，
 * 账户、inbox 与会话模块共用同一口径。
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
