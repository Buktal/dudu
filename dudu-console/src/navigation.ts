import { useSyncExternalStore } from "react";
import { validId } from "./api/validators";
export type View =
  | "employees"
  | "user-groups"
  | "channel-accounts"
  | "account"
  | "translation"
  | "login";
const views = new Set<string>([
  "employees",
  "user-groups",
  "channel-accounts",
  "account",
  "translation",
  "login",
]);
// 路由语法：query 参数名与取值约定，写（routes）读（parseRoute）共用。
const CREATE_PARAM = "create";
const CREATE_FLAG = "1";
const USER_ID_PARAM = "userId";
const GROUP_ID_PARAM = "groupId";
const ACCOUNT_ID_PARAM = "accountId";
const subscribe = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};
// 「#/」前缀单点：站内锚地址与 navigate 的写哈希共用同一约定。
export const href = (path: string) => `#/${path}`;
export const navigate = (path: string) => {
  window.location.hash = href(path);
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
  employees: (id?: string | null) => route("employees", USER_ID_PARAM, id),
  userGroups: (id?: string | null) => route("user-groups", GROUP_ID_PARAM, id),
  channelAccounts: (id?: string | null, groupId?: string | null) =>
    route(
      "channel-accounts",
      ACCOUNT_ID_PARAM,
      id,
      groupId ? { [GROUP_ID_PARAM]: groupId } : undefined,
    ),
  account: () => "account",
  translation: () => "translation",
  login: () => "login",
  employeeCreate: () => `employees?${CREATE_PARAM}=${CREATE_FLAG}`,
  groupCreate: () => `user-groups?${CREATE_PARAM}=${CREATE_FLAG}`,
  channelCreate: (groupId?: string) =>
    route("channel-accounts", undefined, undefined, {
      [CREATE_PARAM]: CREATE_FLAG,
      ...(groupId ? { [GROUP_ID_PARAM]: groupId } : {}),
    }),
};
export function parseRoute(hash: string) {
  const [path, query] = hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(query);
  const view = views.has(path) ? (path as View) : "login";
  const id = params.get(
    view === "employees"
      ? USER_ID_PARAM
      : view === "user-groups"
        ? GROUP_ID_PARAM
        : ACCOUNT_ID_PARAM,
  );
  const groupId = params.get(GROUP_ID_PARAM);
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
