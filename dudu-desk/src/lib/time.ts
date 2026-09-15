import dayjs from "dayjs";
import "dayjs/locale/zh-cn";

dayjs.locale("zh-cn");

export function messageTime(value: string): string {
  const time = dayjs(value);
  return time.isValid() ? time.format("HH:mm") : "时间未提供";
}

export function messageDate(value: string): string {
  const time = dayjs(value);
  return time.isValid() ? time.format("M 月 D 日") : "时间未提供";
}

export function fullTime(value: string): string {
  const time = dayjs(value);
  return time.isValid() ? time.format("YYYY-MM-DD HH:mm:ss") : "时间未提供";
}

export function nowIso(): string {
  return dayjs().toISOString();
}

export function isTimeAfter(value: string, reference: string): boolean | null {
  const time = dayjs(value);
  const boundary = dayjs(reference);
  if (!time.isValid() || !boundary.isValid()) return null;
  return time.isAfter(boundary);
}
