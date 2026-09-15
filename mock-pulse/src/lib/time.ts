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
 * 固定偏移直接按 UTC 毫秒 + 8h 用 Date.UTC getters 取数——dayjs core 的
 * utcOffset(8) 写入需 utc 插件，不为此引插件（#49）。
 */
export function bilibiliTimestamp(now = Date.now()): string {
  const shifted = new Date(now + 8 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    ` ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`
  );
}
