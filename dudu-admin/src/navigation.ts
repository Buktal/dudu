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
const subscribe = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};
const getHash = () => window.location.hash;
export const navigate = (path: string) => {
  window.location.hash = `/${path}`;
};

export function useRoute() {
  const hash = useSyncExternalStore(subscribe, getHash);
  const [path, search] = hash.replace(/^#\/?/, "").split("?");
  const params = new URLSearchParams(search);
  const id = params.get("companyId");
  return {
    view: (views.has(path) ? path : "companies") as View,
    selectedId: validCompanyId(id) ? id : null,
    creating: params.get("create") === "1",
  };
}
