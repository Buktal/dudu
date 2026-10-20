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
const subscribe = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};
export const navigate = (path: string) => {
  window.location.hash = `/${path}`;
};
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
  employeeCreate: () => "employees?create=1",
  groupCreate: () => "user-groups?create=1",
  channelCreate: (groupId?: string) =>
    route("channel-accounts", undefined, undefined, {
      create: "1",
      ...(groupId ? { groupId } : {}),
    }),
  accountCreate: (groupId?: string) =>
    route("channel-accounts", undefined, undefined, {
      create: "1",
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
    creating: params.get("create") === "1",
    groupId: validId(groupId) ? groupId : null,
  };
}
export function useRoute() {
  return parseRoute(
    useSyncExternalStore(subscribe, () => window.location.hash),
  );
}
