import {
  type AdminClient,
  isAccount,
  isEmpty,
  isRecord,
  PROFILE_PATH,
} from "./client";
import type {
  CompanyProfile,
  CompanyQuery,
  CreateCompany,
  LogQuery,
} from "./types";
import {
  isCompany,
  isDetail,
  isLog,
  isOverview,
  isResources,
  pageOf,
  validCompanyId,
} from "./validators";

// 企业启停状态值，与后端 EnableStatusEnum 对齐：0 停用、1 恢复
const STATUS_DISABLED = 0;
const STATUS_ENABLED = 1;

export const adminApi = {
  companies: (client: AdminClient, query: CompanyQuery, signal: AbortSignal) =>
    client.request("/admin/companies/query", {
      method: "POST",
      body: query,
      signal,
      paginated: true,
      validate: pageOf(isCompany),
    }),
  company: (client: AdminClient, id: string, signal: AbortSignal) =>
    client.request(`/admin/companies/${encodeURIComponent(id)}`, {
      signal,
      validate: isDetail,
    }),
  create: (client: AdminClient, body: CreateCompany, signal: AbortSignal) =>
    client.request("/admin/companies", {
      method: "POST",
      body,
      signal,
      validate: isCompany,
    }),
  update: (
    client: AdminClient,
    id: string,
    body: CompanyProfile,
    signal: AbortSignal,
  ) =>
    client.request(`/admin/companies/${encodeURIComponent(id)}`, {
      method: "PUT",
      body,
      signal,
      validate: isCompany,
    }),
  candidate: (client: AdminClient, signal: AbortSignal) =>
    client.request("/admin/companies/id_candidates", {
      method: "POST",
      signal,
      validate: (data): data is { companyId: string } =>
        isRecord(data) && validCompanyId(data.companyId),
    }),
  availability: (client: AdminClient, companyId: string, signal: AbortSignal) =>
    client.request(
      `/admin/companies/id_availability?companyId=${encodeURIComponent(companyId)}`,
      {
        signal,
        validate: (data): data is { companyId: string; available: boolean } =>
          isRecord(data) &&
          data.companyId === companyId &&
          typeof data.available === "boolean",
      },
    ),
  disable: (
    client: AdminClient,
    id: string,
    disableReason: string,
    signal: AbortSignal,
  ) =>
    client.request(`/admin/companies/${encodeURIComponent(id)}/status`, {
      method: "PUT",
      body: { status: STATUS_DISABLED, disableReason },
      signal,
      validate: isEmpty,
    }),
  enable: (client: AdminClient, id: string, signal: AbortSignal) =>
    client.request(`/admin/companies/${encodeURIComponent(id)}/status`, {
      method: "PUT",
      body: { status: STATUS_ENABLED },
      signal,
      validate: isEmpty,
    }),
  resetPassword: (
    client: AdminClient,
    id: string,
    newPassword: string,
    signal: AbortSignal,
  ) =>
    client.request(
      `/admin/companies/${encodeURIComponent(id)}/initial_admin/password`,
      { method: "PUT", body: { newPassword }, signal, validate: isEmpty },
    ),
  overview: (client: AdminClient, signal: AbortSignal) =>
    client.request("/admin/overview", { signal, validate: isOverview }),
  resources: (client: AdminClient, id: string, signal: AbortSignal) =>
    client.request(
      `/admin/companies/${encodeURIComponent(id)}/resource_summary`,
      {
        signal,
        validate: (data): data is import("./types").Resources =>
          isResources(data) && data.companyId === id,
      },
    ),
  logs: (client: AdminClient, query: LogQuery, signal: AbortSignal) =>
    client.request("/admin/operation_logs/query", {
      method: "POST",
      body: query,
      signal,
      paginated: true,
      validate: pageOf(isLog),
    }),
  profile: (client: AdminClient, signal: AbortSignal) =>
    client.request(PROFILE_PATH, {
      signal,
      validate: isAccount,
    }),
  changePassword: (
    client: AdminClient,
    oldPassword: string,
    newPassword: string,
    signal: AbortSignal,
  ) =>
    client.request("/admin/profile/password", {
      method: "PUT",
      body: { oldPassword, newPassword },
      signal,
      validate: isEmpty,
    }),
};
