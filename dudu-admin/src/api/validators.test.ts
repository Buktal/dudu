import { describe, expect, it } from "vitest";
import { company } from "@/test/http";
import { isCompany, isLog, isRecord, pageOf } from "./validators";

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

describe("isLog", () => {
  const log = {
    operationLogId: "1",
    operatorUserId: "2",
    companyId: null,
    action: "company.create",
    target: "company",
    targetId: "123456",
    summary: null,
    createTime: "2026-10-22 10:00:00",
  } as const;

  it("接受服务端操作码，拒绝未知 action", () => {
    expect(isLog(log)).toBe(true);
    expect(isCompany(company)).toBe(true);
    expect(isLog({ ...log, action: "company.export" })).toBe(false);
    expect(isLog({ ...log, action: "toString" })).toBe(false);
  });
});
