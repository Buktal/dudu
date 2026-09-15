import { describe, expect, it } from "vitest";

import { randomDigits, randomFromChars } from "./random";

/**
 * 随机 ID 基础件的单测：生成器形态约束（位数/首位/字符集）由各渠道生成器
 * 与 schema 测试钉住，这里只验基础件的边界语义。
 */

describe("randomDigits", () => {
  it("生成指定位数，首位缺省非零（1~9）", () => {
    for (let i = 0; i < 32; i += 1) {
      const digits = randomDigits(18);
      expect(digits).toMatch(/^[1-9]\d{17}$/);
    }
  });

  it("固定首位时首位恒为该值（首位取 1 恒在 2^53/int64 内的口径）", () => {
    for (let i = 0; i < 16; i += 1) {
      expect(randomDigits(15, 1)).toMatch(/^1\d{14}$/);
    }
  });

  it("区间首位恒落在区间内（{min:1,max:6} 保证 int64 上限的口径）", () => {
    for (let i = 0; i < 64; i += 1) {
      const head = randomDigits(19, { min: 1, max: 6 })[0];
      expect(Number(head)).toBeGreaterThanOrEqual(1);
      expect(Number(head)).toBeLessThanOrEqual(6);
    }
  });

  it("随机性：两次生成互不相同", () => {
    expect(randomDigits(18)).not.toBe(randomDigits(18));
  });
});

describe("randomFromChars", () => {
  it("从字符集均匀采样指定位数，字符都在集内", () => {
    const charset = "0123456789abcdef";
    const sampled = randomFromChars(charset, 32);
    expect(sampled).toHaveLength(32);
    for (const char of sampled) {
      expect(charset).toContain(char);
    }
  });
});
