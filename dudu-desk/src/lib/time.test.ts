import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { elapsedSeconds, nowWallTime } from "./time";

describe("nowWallTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("按服务器口径输出北京墙面时间，无时区标记", () => {
    vi.setSystemTime(new Date("2026-10-15T02:30:05.000Z"));
    expect(nowWallTime()).toBe("2026-10-15 10:30:05");
  });

  it("UTC 日期与北京日期不同时按北京日期输出", () => {
    vi.setSystemTime(new Date("2026-10-15T17:00:00.000Z"));
    expect(nowWallTime()).toBe("2026-10-16 01:00:00");
  });
});

describe("elapsedSeconds", () => {
  it("同格式墙面时间的差值与浏览器时区无关", () => {
    expect(elapsedSeconds("2026-10-15 09:00:00", "2026-10-15 09:05:30")).toBe(
      330,
    );
  });
});
