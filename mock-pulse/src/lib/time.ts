import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

/** 时间格式化唯一入口（dayjs 封装） */

// 固定 UTC+8 换算需要 utc 插件（随 dayjs 包发行，零新依赖），入口处启用一次
dayjs.extend(utc);

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

/**
 * 淘宝退款消息 modified 的线上格式（事实库 §5.4 字段口径：
 * `yyyy-MM-dd HH:mm:ss`，官方样本 2000-12-30 12:32:20）。
 */
export function taobaoModified(): string {
  return dayjs().format("YYYY-MM-DD HH:mm:ss");
}

/**
 * B站事件 timestamp 的线上格式（事实库 §2.2 公共包络表逐字：
 * `yyyy-MM-dd HH:mm:ss`，UTC+8 固定偏移；与主调方机器时区无关）。
 * 固定偏移经 dayjs utc 插件换算（utcOffset(8) 为固定偏移写入，非机器时区），
 * 不手写 Date 换算。
 */
export function bilibiliTimestamp(now = Date.now()): string {
  return dayjs(now).utcOffset(8).format("YYYY-MM-DD HH:mm:ss");
}
