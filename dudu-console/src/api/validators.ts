import type { Page, Profile } from "./types";
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
export const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9]\d*$/.test(value);
export const validCompanyId = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9]\d{5}$/.test(value);
export const isProfile = (data: unknown): data is Profile =>
  isRecord(data) &&
  isRecord(data.company) &&
  validCompanyId(data.company.companyId) &&
  typeof data.company.companyName === "string" &&
  isRecord(data.user) &&
  validId(data.user.userId) &&
  typeof data.user.username === "string" &&
  typeof data.user.name === "string" &&
  data.user.role === "console" &&
  typeof data.user.isInitialAdmin === "boolean" &&
  Array.isArray(data.managedGroupIds) &&
  data.managedGroupIds.every(validId);
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
// 服务端分页契约（PageQuery.MAX_PAGE_SIZE）：单页最多 100 条
export const MAX_PAGE_SIZE = 100;

export function pageOf<T>(item: (value: unknown) => value is T) {
  return (data: unknown): data is Page<T> =>
    isRecord(data) &&
    Array.isArray(data.list) &&
    data.list.every(item) &&
    count(data.total) &&
    count(data.page) &&
    data.page > 0 &&
    count(data.pageSize) &&
    data.pageSize > 0 &&
    data.pageSize <= MAX_PAGE_SIZE;
}
