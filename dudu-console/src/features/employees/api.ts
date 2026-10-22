import type { ConsoleClient } from "@/api/client";
import type { Page } from "@/api/types";
import { isRecord, pageOf, validId } from "@/api/validators";
// 员工字段长度契约（data-contract：username2–64，name1–100）：
// 登录名创建后不改，显示名称可改、允许重名
export const USERNAME_MIN_LENGTH = 2;
export const USERNAME_MAX_LENGTH = 64;
export const NAME_MAX_LENGTH = 100;

export interface Employee {
  userId: string;
  username: string;
  name: string;
  role: "user" | "console";
  status: 0 | 1;
  isInitialAdmin: boolean;
  groupIds: string[];
  createTime: string;
  updateTime: string;
}
export interface EmployeeFilters {
  page: number;
  pageSize: number;
  keyword?: string;
  role?: "user" | "console";
  status?: 0 | 1;
}
export const isEmployee = (data: unknown): data is Employee =>
  isRecord(data) &&
  validId(data.userId) &&
  typeof data.username === "string" &&
  typeof data.name === "string" &&
  (data.role === "user" || data.role === "console") &&
  (data.status === 0 || data.status === 1) &&
  typeof data.isInitialAdmin === "boolean" &&
  Array.isArray(data.groupIds) &&
  data.groupIds.every(validId) &&
  typeof data.createTime === "string" &&
  typeof data.updateTime === "string";
export const queryEmployees = (
  client: ConsoleClient,
  body: EmployeeFilters,
  signal: AbortSignal,
) =>
  client.request<Page<Employee>>("/console/employees/query", {
    method: "POST",
    body,
    signal,
    paginated: true,
    validate: pageOf(isEmployee),
  });
export const getEmployee = (
  client: ConsoleClient,
  id: string,
  signal: AbortSignal,
) =>
  client.request<Employee>(`/console/employees/${encodeURIComponent(id)}`, {
    signal,
    validate: isEmployee,
  });
export const createEmployee = (
  client: ConsoleClient,
  body: { username: string; name: string; password: string },
  signal: AbortSignal,
) =>
  client.request<Employee>("/console/employees", {
    method: "POST",
    body,
    signal,
    validate: isEmployee,
  });
export const updateEmployee = (
  client: ConsoleClient,
  id: string,
  action: "name" | "role" | "status",
  body: object,
  signal: AbortSignal,
) =>
  client.request<Employee>(
    `/console/employees/${encodeURIComponent(id)}${action === "name" ? "" : `/${action}`}`,
    { method: "PUT", body, signal, validate: isEmployee },
  );
export const resetPassword = (
  client: ConsoleClient,
  id: string,
  newPassword: string,
  signal: AbortSignal,
) =>
  client.request<null>(
    `/console/employees/${encodeURIComponent(id)}/password`,
    {
      method: "PUT",
      body: { newPassword },
      signal,
      validate: (data): data is null => data === null,
    },
  );
