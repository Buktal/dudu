import { describe, expect, it } from "vitest";
import { profile } from "@/test/http";
import { isProfile, isRecord, pageOf } from "./validators";

describe("isRecord", () => {
  it("只接受对象字典，数组与原始值一律拒绝", () => {
    expect(isRecord({ code: 0 })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord(null)).toBe(false);
    expect(isRecord("ok")).toBe(false);
  });
});

describe("pageOf", () => {
  it("接受合法分页，拒绝超过服务端单页上限（100）的 pageSize", () => {
    const page = (pageSize: number) => ({
      list: [] as unknown[],
      total: 0,
      page: 1,
      pageSize,
    });
    const accepts = (_value: unknown): _value is { list: unknown[] } => true;
    expect(pageOf(accepts)(page(100))).toBe(true);
    expect(pageOf(accepts)(page(101))).toBe(false);
    expect(pageOf(accepts)(page(0))).toBe(false);
  });
});

it("isProfile 接受共享身份夹具的契约形状", () => {
  expect(isProfile(profile)).toBe(true);
});
