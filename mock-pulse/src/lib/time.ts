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
