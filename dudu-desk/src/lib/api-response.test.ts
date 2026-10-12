import { describe, expect, it } from "vitest";
import { readApiEnvelope } from "./api-response";

describe("Desk API response contract", () => {
  it("rejects an authentication business code even when transport succeeded", () => {
    expect(() =>
      readApiEnvelope({ code: 10101, msg: "坐席登录已失效", data: null }),
    ).toThrowError(
      expect.objectContaining({
        kind: "authentication",
        message: "坐席登录已失效",
        code: 10101,
      }),
    );
  });

  it("separates missing access from expired credentials", () => {
    expect(() =>
      readApiEnvelope({ code: 10106, msg: "无访问权限", data: null }),
    ).toThrowError(
      expect.objectContaining({
        kind: "forbidden",
        message: "无访问权限",
        code: 10106,
      }),
    );
  });

  it("rejects malformed success envelopes instead of treating them as data", () => {
    expect(() => readApiEnvelope({ code: 0 })).toThrowError(
      expect.objectContaining({ kind: "invalid-response" }),
    );
  });
});
