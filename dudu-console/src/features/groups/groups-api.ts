import type { ConsoleClient } from "@/api/client";
import { isRecord } from "@/api/client";
import { pageOf, validId } from "@/api/validators";
// 渠道账号实体与校验器收敛在 channel-accounts 单点：组页账号列表查同一接口
import { isAccount } from "../channel-accounts/api";
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
export interface Filters {
  page: number;
  pageSize: number;
  keyword?: string;
}
const count = (v: unknown) => Number.isSafeInteger(v) && Number(v) >= 0;
const group = (v: unknown): v is Group =>
  isRecord(v) &&
  validId(v.groupId) &&
  typeof v.groupName === "string" &&
  count(v.memberCount) &&
  count(v.channelAccountCount) &&
  typeof v.createTime === "string" &&
  typeof v.updateTime === "string";
const candidate = (v: unknown): v is Candidate =>
  isRecord(v) &&
  validId(v.userId) &&
  typeof v.username === "string" &&
  typeof v.name === "string" &&
  (v.role === "user" || v.role === "console");
const member = (v: unknown): v is Member =>
  isRecord(v) && (v.status === 0 || v.status === 1) && candidate(v);
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
      validate: pageOf(group),
    }),
  detail: (client: ConsoleClient, groupId: string, signal?: AbortSignal) =>
    client.request(`${base}/${encodeURIComponent(groupId)}`, {
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
    client.request(groupId ? `${base}/${encodeURIComponent(groupId)}` : base, {
      method: groupId ? "PUT" : "POST",
      body: { groupName: groupName.trim() },
      signal,
      write: true,
      validate: group,
    }),
  members: (
    client: ConsoleClient,
    groupId: string,
    filters: Filters,
    signal: AbortSignal,
  ) =>
    client.request(
      `${base}/${encodeURIComponent(groupId)}/members?${params(filters)}`,
      {
        signal,
        paginated: true,
        validate: pageOf(member),
      },
    ),
  candidates: (
    client: ConsoleClient,
    groupId: string,
    filters: Filters,
    signal: AbortSignal,
  ) =>
    client.request(
      `${base}/${encodeURIComponent(groupId)}/member_candidates?${params(filters)}`,
      {
        signal,
        paginated: true,
        validate: pageOf(candidate),
      },
    ),
  add: (
    client: ConsoleClient,
    groupId: string,
    userId: string,
    signal?: AbortSignal,
  ) =>
    client.request(
      `${base}/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
      {
        method: "PUT",
        signal,
        write: true,
        validate: relation(groupId, userId, true),
      },
    ),
  remove: (
    client: ConsoleClient,
    groupId: string,
    userId: string,
    signal?: AbortSignal,
  ) =>
    client.request(
      `${base}/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        signal,
        write: true,
        validate: relation(groupId, userId, false),
      },
    ),
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
      validate: pageOf(isAccount),
    }),
};
