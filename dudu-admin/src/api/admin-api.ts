import { type AdminClient, isEmpty, isRecord } from "./client";
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

function queryString(query: CompanyQuery | LogQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return params.toString();
}

export const adminApi = {
  companies: (client: AdminClient, query: CompanyQuery, signal: AbortSignal) =>
    client.request(`/admin/companies?${queryString(query)}`, {
      signal,
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
    client.request("/admin/companies/id-candidates", {
      method: "POST",
      signal,
      validate: (data): data is { companyId: string } =>
        isRecord(data) && validCompanyId(data.companyId),
    }),
  availability: (client: AdminClient, companyId: string, signal: AbortSignal) =>
    client.request(
      `/admin/companies/id-availability?companyId=${encodeURIComponent(companyId)}`,
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
    client.request(`/admin/companies/${encodeURIComponent(id)}/disable`, {
      method: "POST",
      body: { disableReason },
      signal,
      validate: isEmpty,
    }),
  enable: (client: AdminClient, id: string, signal: AbortSignal) =>
    client.request(`/admin/companies/${encodeURIComponent(id)}/enable`, {
      method: "POST",
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
      `/admin/companies/${encodeURIComponent(id)}/admin-password-reset`,
      { method: "POST", body: { newPassword }, signal, validate: isEmpty },
    ),
  overview: (client: AdminClient, signal: AbortSignal) =>
    client.request("/admin/overview", { signal, validate: isOverview }),
  resources: (client: AdminClient, id: string, signal: AbortSignal) =>
    client.request(
      `/admin/companies/${encodeURIComponent(id)}/resource-summary`,
      {
        signal,
        validate: (data): data is import("./types").Resources =>
          isResources(data) && data.companyId === id,
      },
    ),
  logs: (client: AdminClient, query: LogQuery, signal: AbortSignal) =>
    client.request(`/admin/operation-logs?${queryString(query)}`, {
      signal,
      validate: pageOf(isLog),
    }),
  changePassword: (
    client: AdminClient,
    oldPassword: string,
    newPassword: string,
    signal: AbortSignal,
  ) =>
    client.request("/admin/account/password", {
      method: "PUT",
      body: { oldPassword, newPassword },
      signal,
      validate: isEmpty,
    }),
};
