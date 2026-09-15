import dayjs from "dayjs";

/** 时间格式化唯一入口（dayjs 封装） */

export function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return "—";
  return dayjs(iso).format("YYYY-MM-DD HH:mm");
}

export function formatClock(iso: string | undefined | null): string {
  if (!iso) return "—";
  return dayjs(iso).format("MM-DD HH:mm");
}

/**
 * 微博粉服 created_at 的线上格式（事实库 §2.1 公共字段：如
 * `Mon Jul 16 18:09:20 +0800 2012`，周/月英文短名 + 零填充 + ZZ 无冒号时区）。
 */
export function weiboCreatedAt(): string {
  return dayjs().format("ddd MMM DD HH:mm:ss ZZ YYYY");
}
