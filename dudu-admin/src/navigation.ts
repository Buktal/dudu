import { useSyncExternalStore } from "react";
import { validCompanyId } from "./api/validators";

export type View = "companies" | "overview" | "resources" | "logs" | "account";
const views = new Set<string>([
  "companies",
  "overview",
  "resources",
  "logs",
  "account",
]);
// 路由语法：query 参数名与取值约定，写（routes）读（parseRoute）共用。
const COMPANY_ID_PARAM = "companyId";
const CREATE_PARAM = "create";
const CREATE_FLAG = "1";
const subscribe = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};
// 「#/」前缀单点：站内锚地址与 navigate 的写哈希共用同一约定。
export const href = (path: string) => `#/${path}`;
export const navigate = (path: string) => {
  window.location.hash = href(path);
};
// 路由构造：页面跳转只表达意图；参数名、编码与「回纯列表即清参关闭弹层」的语义在此单点。
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
  overview: () => route("overview"),
  companies: () => route("companies"),
  companyCreate: () =>
    route("companies", undefined, undefined, { [CREATE_PARAM]: CREATE_FLAG }),
  companyDetail: (companyId: string) =>
    route("companies", COMPANY_ID_PARAM, companyId),
  resources: (companyId?: string | null) =>
    route("resources", COMPANY_ID_PARAM, companyId),
  logs: () => route("logs"),
  account: () => route("account"),
};

export function parseRoute(hash: string) {
  const [path, query] = hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(query);
  const view = views.has(path) ? (path as View) : "companies";
  const id = params.get(COMPANY_ID_PARAM);
  return {
    view,
    selectedId: validCompanyId(id) ? id : null,
    creating: params.get(CREATE_PARAM) === CREATE_FLAG,
  };
}

export function useRoute() {
  return parseRoute(
    useSyncExternalStore(subscribe, () => window.location.hash),
  );
}
