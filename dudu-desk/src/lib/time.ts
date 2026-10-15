import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("zh-cn");

const SERVER_TIME_ZONE = "Asia/Shanghai";

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

/**
 * 服务器同口径的当前时间：北京墙面时间 YYYY-MM-DD HH:mm:ss，无时区标记。
 */
export function nowWallTime(): string {
  return dayjs().tz(SERVER_TIME_ZONE).format("YYYY-MM-DD HH:mm:ss");
}

export function elapsedSeconds(
  since: string,
  now = nowWallTime(),
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
