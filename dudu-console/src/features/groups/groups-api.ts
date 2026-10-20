import type { ConsoleClient } from "@/api/client";
import { isRecord } from "@/api/client";
import type { Page } from "@/api/types";
export interface Group {
  groupId: string;
  groupName: string;
  memberCount: number;
  channelAccountCount: number;
  createTime: string;
  updateTime: string;
}
export interface Member {
  userId: string;
  username: string;
  name: string;
  role: "user" | "console";
  status: 0 | 1;
}
export type Candidate = Omit<Member, "status">;
export interface GroupAccount {
  companyChannelId: string;
  groupId: string;
  groupName: string;
  channel: string;
  accountName: string;
  receiveConfigured: boolean;
  sendConfigured: boolean;
  missingReceiveFields: string[];
  missingSendFields: string[];
  createTime: string;
  updateTime: string;
}
export interface Filters {
  page: number;
  pageSize: number;
  keyword?: string;
}
const id = (v: unknown): v is string =>
  typeof v === "string" && /^\d+$/.test(v);
const count = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
const group = (v: unknown): v is Group =>
  isRecord(v) &&
  id(v.groupId) &&
  typeof v.groupName === "string" &&
  count(v.memberCount) &&
  count(v.channelAccountCount) &&
  typeof v.createTime === "string" &&
  typeof v.updateTime === "string";
const candidate = (v: unknown): v is Candidate =>
  isRecord(v) &&
  id(v.userId) &&
  typeof v.username === "string" &&
  typeof v.name === "string" &&
  (v.role === "user" || v.role === "console");
const member = (v: unknown): v is Member =>
  isRecord(v) && (v.status === 0 || v.status === 1) && candidate(v);
const account = (v: unknown): v is GroupAccount =>
  isRecord(v) &&
  id(v.companyChannelId) &&
  id(v.groupId) &&
  typeof v.accountName === "string" &&
  typeof v.channel === "string" &&
  typeof v.receiveConfigured === "boolean" &&
  typeof v.sendConfigured === "boolean";
const page =
  <T>(check: (v: unknown) => v is T) =>
  (v: unknown): v is Page<T> =>
    isRecord(v) &&
    Array.isArray(v.list) &&
    v.list.every(check) &&
    count(v.total) &&
    Number.isInteger(v.page) &&
    Number(v.page) > 0 &&
    Number.isInteger(v.pageSize) &&
    Number(v.pageSize) > 0;
const base = "/console/user_groups";
const params = (filters: Filters) =>
  new URLSearchParams(
    Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  ).toString();
const relation =
  (groupId: string, userId: string, expected: boolean) =>
  (v: unknown): v is { groupId: string; userId: string; member: boolean } =>
    isRecord(v) &&
    v.groupId === groupId &&
    v.userId === userId &&
    v.member === expected;
export const groupsApi = {
  query: (client: ConsoleClient, filters: Filters, signal: AbortSignal) =>
    client.request(`${base}/query`, {
      method: "POST",
      body: filters,
      signal,
      paginated: true,
      validate: page(group),
    }),
  detail: (client: ConsoleClient, groupId: string, signal?: AbortSignal) =>
    client.request(`${base}/${groupId}`, {
      signal,
      validate: (value): value is Group =>
        group(value) && value.groupId === groupId,
    }),
  save: (
    client: ConsoleClient,
    groupName: string,
    groupId?: string,
    signal?: AbortSignal,
  ) =>
    client.request(groupId ? `${base}/${groupId}` : base, {
      method: groupId ? "PUT" : "POST",
      body: { groupName: groupName.trim() },
      signal,
      validate: group,
    }),
  members: (
    client: ConsoleClient,
    groupId: string,
    filters: Filters,
    signal: AbortSignal,
  ) =>
    client.request(`${base}/${groupId}/members?${params(filters)}`, {
      signal,
      paginated: true,
      validate: page(member),
    }),
  candidates: (
    client: ConsoleClient,
    groupId: string,
    filters: Filters,
    signal: AbortSignal,
  ) =>
    client.request(`${base}/${groupId}/member_candidates?${params(filters)}`, {
      signal,
      paginated: true,
      validate: page(candidate),
    }),
  add: (
    client: ConsoleClient,
    groupId: string,
    userId: string,
    signal?: AbortSignal,
  ) =>
    client.request(`${base}/${groupId}/members/${userId}`, {
      method: "PUT",
      signal,
      validate: relation(groupId, userId, true),
    }),
  remove: (
    client: ConsoleClient,
    groupId: string,
    userId: string,
    signal?: AbortSignal,
  ) =>
    client.request(`${base}/${groupId}/members/${userId}`, {
      method: "DELETE",
      signal,
      validate: relation(groupId, userId, false),
    }),
  accounts: (
    client: ConsoleClient,
    groupId: string,
    filters: Filters,
    signal: AbortSignal,
  ) =>
    client.request("/console/company_channels/query", {
      method: "POST",
      body: { ...filters, groupId },
      signal,
      paginated: true,
      validate: page(account),
    }),
};
