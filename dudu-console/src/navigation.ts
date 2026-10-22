import { useSyncExternalStore } from "react";
import { validId } from "./api/validators";
export type View =
  | "employees"
  | "user-groups"
  | "channel-accounts"
  | "account"
  | "login";
const views = new Set<string>([
  "employees",
  "user-groups",
  "channel-accounts",
  "account",
  "login",
]);
// 路由语法：query 参数名与取值约定，写（routes）读（parseRoute）共用。
const CREATE_PARAM = "create";
const CREATE_FLAG = "1";
const subscribe = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};
export const navigate = (path: string) => {
  window.location.hash = `/${path}`;
};
// 路由构造：页面跳转只表达意图；参数名、取值与「回纯列表即清参关闭弹层」的语义在此单点。
const route = (
  view: View,
  key?: string,
  id?: string | null,
  extra?: Record<string, string>,
) => {
  const params = new URLSearchParams(extra);
  if (key && id) params.set(key, id);
  return view + (params.size ? `?${params}` : "");
};
export const routes = {
  employees: (id?: string | null) => route("employees", "userId", id),
  userGroups: (id?: string | null) => route("user-groups", "groupId", id),
  channelAccounts: (id?: string | null, groupId?: string | null) =>
    route(
      "channel-accounts",
      "accountId",
      id,
      groupId ? { groupId } : undefined,
    ),
  account: () => "account",
  login: () => "login",
  employeeCreate: () => `employees?${CREATE_PARAM}=${CREATE_FLAG}`,
  groupCreate: () => `user-groups?${CREATE_PARAM}=${CREATE_FLAG}`,
  channelCreate: (groupId?: string) =>
    route("channel-accounts", undefined, undefined, {
      [CREATE_PARAM]: CREATE_FLAG,
      ...(groupId ? { groupId } : {}),
    }),
};
export function parseRoute(hash: string) {
  const [path, query] = hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(query);
  const view = views.has(path) ? (path as View) : "login";
  const id = params.get(
    view === "employees"
      ? "userId"
      : view === "user-groups"
        ? "groupId"
        : "accountId",
  );
  const groupId = params.get("groupId");
  return {
    view,
    selectedId: validId(id) ? id : null,
    creating: params.get(CREATE_PARAM) === CREATE_FLAG,
    groupId: validId(groupId) ? groupId : null,
  };
}
export function useRoute() {
  return parseRoute(
    useSyncExternalStore(subscribe, () => window.location.hash),
  );
}
