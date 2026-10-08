import { vi } from "vitest";
import type { Account, Company, CompanyDetail, Page } from "@/api/types";

export const account: Account = {
  userId: "42",
  username: "operator",
  name: "平台运营",
  role: "admin",
};
export const company: Company = {
  companyId: "123456",
  companyName: "青禾科技",
  contactName: "林先生",
  contactInfo: "support@example.com",
  remark: "优先联系负责人",
  status: 1,
  disableReason: null,
  createTime: "2026-09-28 16:00:00",
  updateTime: "2026-09-29 17:00:00",
};
export const detail: CompanyDetail = {
  company,
  adminInit: {
    userId: "9007199254740993",
    username: "admin",
    name: "企业管理员",
    status: 1,
    createTime: company.createTime,
  },
};
export const page = (list: Company[] = [company]): Page<Company> => ({
  list,
  total: list.length,
  page: 1,
  pageSize: 20,
});
export const success = (data: unknown) =>
  Response.json(
    data && typeof data === "object" && "list" in data
      ? { code: 0, msg: "成功", ...data }
      : { code: 0, msg: "成功", data },
  );
export const failure = (code: number, msg: string) =>
  Response.json({ code, msg, data: null });

export function installHttp(
  handler: (url: URL, init: RequestInit) => Response | Promise<Response>,
) {
  const fetchRequest = vi.fn(
    (input: string | URL | Request, init: RequestInit) => {
      // 开发模式请求为同源相对路径，按当前页面地址解析
      const url = new URL(String(input), window.location.href);
      if (url.pathname === "/api/admin/login")
        return Promise.resolve(
          success({ token: "test-token", exp: 2000000000, user: account }),
        );
      if (
        url.pathname === "/api/admin/profile" &&
        (init.method ?? "GET") === "GET"
      )
        return Promise.resolve(success(account));
      return Promise.resolve(handler(url, init));
    },
  );
  vi.stubGlobal("fetch", fetchRequest);
  return fetchRequest;
}

export function authenticatedSession(hash = "") {
  sessionStorage.setItem(
    "dudu-admin.session",
    JSON.stringify({ origin: "", token: "test-token" }),
  );
  window.history.replaceState(null, "", `/${hash}`);
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
