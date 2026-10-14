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

export function relativeIso(value: string, seconds: number): string {
  return dayjs(value).add(seconds, "second").toISOString();
}

export function elapsedSeconds(
  since: string,
  now = nowIso(),
): number | undefined {
  const start = dayjs(since);
  const end = dayjs(now);
  return start.isValid() && end.isValid()
    ? Math.max(0, end.diff(start, "second"))
    : undefined;
}

export function timestamp(value?: string): number | undefined {
  if (!value) return;
  const time = dayjs(value);
  return time.isValid() ? time.valueOf() : undefined;
}
