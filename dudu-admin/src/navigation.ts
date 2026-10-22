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
const getHash = () => window.location.hash;
export const navigate = (path: string) => {
  window.location.hash = `/${path}`;
};
// 路由构造：页面跳转只表达意图；参数名、编码与「回纯列表即清参关闭弹层」的语义在此单点。
export const routes = {
  overview: () => "overview",
  companies: () => "companies",
  companyCreate: () => `companies?${CREATE_PARAM}=${CREATE_FLAG}`,
  companyDetail: (companyId: string) =>
    `companies?${COMPANY_ID_PARAM}=${encodeURIComponent(companyId)}`,
  resources: (companyId?: string) =>
    companyId
      ? `resources?${COMPANY_ID_PARAM}=${encodeURIComponent(companyId)}`
      : "resources",
  logs: () => "logs",
  account: () => "account",
};

export const parseRoute = (hash: string) => {
  const [path, search] = hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(search);
  const id = params.get(COMPANY_ID_PARAM);
  return {
    view: (views.has(path) ? path : "companies") as View,
    selectedId: validCompanyId(id) ? id : null,
    creating: params.get(CREATE_PARAM) === CREATE_FLAG,
  };
};

export function useRoute() {
  return parseRoute(useSyncExternalStore(subscribe, getHash));
}
