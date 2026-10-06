import { isRecord } from "./client";
import type {
  Company,
  CompanyDetail,
  OperationLog,
  Overview,
  Page,
  Resources,
} from "./types";

const nullableText = (value: unknown) =>
  value === null || typeof value === "string";
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const status = (value: unknown) => value === "enabled" || value === "disabled";
export const validCompanyId = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9]\d{5}$/.test(value);
// 后端时间为北京时间展示文本：yyyy-MM-dd HH:mm:ss
const time = (value: unknown) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value);

export function isCompany(data: unknown): data is Company {
  return (
    isRecord(data) &&
    validCompanyId(data.companyId) &&
    typeof data.companyName === "string" &&
    status(data.status) &&
    nullableText(data.contactName) &&
    nullableText(data.contactInfo) &&
    nullableText(data.remark) &&
    nullableText(data.disableReason) &&
    time(data.createTime) &&
    time(data.updateTime)
  );
}

export function isDetail(data: unknown): data is CompanyDetail {
  if (!isRecord(data) || !isCompany(data.company)) return false;
  const admin = data.adminInit;
  return (
    admin === null ||
    (isRecord(admin) &&
      typeof admin.userId === "string" &&
      typeof admin.username === "string" &&
      typeof admin.name === "string" &&
      status(admin.status) &&
      time(admin.createTime))
  );
}

export function pageOf<T>(isItem: (value: unknown) => value is T) {
  return (data: unknown): data is Page<T> =>
    isRecord(data) &&
    Array.isArray(data.list) &&
    data.list.every(isItem) &&
    count(data.total) &&
    count(data.page) &&
    data.page > 0 &&
    count(data.pageSize) &&
    data.pageSize > 0;
}

export function isOverview(data: unknown): data is Overview {
  return (
    isRecord(data) &&
    count(data.totalCompanies) &&
    count(data.enabledCompanies) &&
    count(data.disabledCompanies) &&
    count(data.recentCreatedCount) &&
    Array.isArray(data.recentCompanies) &&
    data.recentCompanies.every(isCompany)
  );
}

export function isResources(data: unknown): data is Resources {
  return (
    isRecord(data) &&
    validCompanyId(data.companyId) &&
    count(data.employeeCount) &&
    count(data.enabledEmployeeCount) &&
    data.enabledEmployeeCount <= data.employeeCount &&
    count(data.groupCount) &&
    count(data.channelAccountCount)
  );
}

export function isLog(data: unknown): data is OperationLog {
  return (
    isRecord(data) &&
    typeof data.operationLogId === "string" &&
    typeof data.operatorUserId === "string" &&
    (data.companyId === null || validCompanyId(data.companyId)) &&
    typeof data.action === "string" &&
    (data.targetType === "company" || data.targetType === "user") &&
    nullableText(data.targetId) &&
    (data.result === "success" || data.result === "failure") &&
    nullableText(data.summary) &&
    time(data.createTime)
  );
}
