import type {
  Company,
  CompanyDetail,
  OperationLog,
  Overview,
  Page,
  Resources,
} from "./types";
import { operationActions } from "./types";

// record 语义：数组不是对象字典，一律拒绝；与 console 侧 validators 同形（ADR-0016）
export const isRecord = (data: unknown): data is Record<string, unknown> =>
  typeof data === "object" && data !== null && !Array.isArray(data);

const nullableText = (value: unknown) =>
  value === null || typeof value === "string";
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const status = (value: unknown) => value === 1 || value === 0;
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

// 服务端分页契约（PageQuery.MAX_PAGE_SIZE）：单页最多 100 条
export const MAX_PAGE_SIZE = 100;

export function pageOf<T>(isItem: (value: unknown) => value is T) {
  return (data: unknown): data is Page<T> =>
    isRecord(data) &&
    Array.isArray(data.list) &&
    data.list.every(isItem) &&
    count(data.total) &&
    count(data.page) &&
    data.page > 0 &&
    count(data.pageSize) &&
    data.pageSize > 0 &&
    data.pageSize <= MAX_PAGE_SIZE;
}

export function isOverview(data: unknown): data is Overview {
  return (
    isRecord(data) &&
    count(data.companyCount) &&
    count(data.companyEnabledCount) &&
    count(data.companyDisabledCount) &&
    count(data.companyCreatedLast7DaysCount) &&
    Array.isArray(data.recentCompanies) &&
    data.recentCompanies.every(isCompany)
  );
}

export function isResources(data: unknown): data is Resources {
  return (
    isRecord(data) &&
    validCompanyId(data.companyId) &&
    count(data.userCount) &&
    count(data.userEnabledCount) &&
    data.userEnabledCount <= data.userCount &&
    count(data.userGroupCount) &&
    count(data.companyChannelCount)
  );
}

// 操作类型必须是服务端操作码：类型宣称 keyof operationActions，校验按成员资格
// 收紧（自有键枚举避开原型链键），未知码在信封校验层拒绝而非由展示层兜底
const isOperationAction = (
  value: unknown,
): value is keyof typeof operationActions =>
  typeof value === "string" && Object.keys(operationActions).includes(value);

export function isLog(data: unknown): data is OperationLog {
  return (
    isRecord(data) &&
    typeof data.operationLogId === "string" &&
    typeof data.operatorUserId === "string" &&
    (data.companyId === null || validCompanyId(data.companyId)) &&
    isOperationAction(data.action) &&
    (data.target === "company" || data.target === "user") &&
    nullableText(data.targetId) &&
    nullableText(data.summary) &&
    time(data.createTime)
  );
}
