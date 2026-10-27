import { vi } from "vitest";
import type { Profile } from "@/api/types";

// 身份夹具：与 console 登录/资料契约（Profile）同形；isInitialAdmin 取真，
// 供默认登录后进入员工管理的用例直接消费，需要受限身份的用例自行改写。
export const profile: Profile = {
  company: { companyId: "100001", companyName: "青禾科技" },
  user: {
    userId: "9",
    username: "manager",
    name: "企业管理员",
    role: "console",
    isInitialAdmin: true,
  },
  managedGroupIds: [],
};
// expiresAt 取远期固定值：客户端不做本地有效期校验，过期由服务端 code（1010x）判定
export const loginResult = {
  token: "test-token",
  expiresAt: 2000000000,
  profile,
};
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
  // 会话身份可按用例覆盖：默认是全量管理的初始管理员；受限身份（如按组管理）
  // 的用例传入自定义 profile，登录与资料拦截共用同一份身份。
  session: { token: string; profile: Profile } = {
    token: "test-token",
    profile,
  },
) {
  const fetchRequest = vi.fn(
    (input: string | URL | Request, init: RequestInit) => {
      // 开发模式请求为同源相对路径，按当前页面地址解析
      const url = new URL(String(input), window.location.href);
      if (url.pathname === "/api/console/login")
        return Promise.resolve(
          success({
            token: session.token,
            expiresAt: loginResult.expiresAt,
            profile: session.profile,
          }),
        );
      if (
        url.pathname === "/api/console/profile" &&
        (init.method ?? "GET") === "GET"
      )
        return Promise.resolve(success(session.profile));
      return Promise.resolve(handler(url, init));
    },
  );
  vi.stubGlobal("fetch", fetchRequest);
  return fetchRequest;
}

export function authenticatedSession(hash = "") {
  sessionStorage.setItem(
    "dudu-console.session",
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
