import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentSession } from "./api";
import { createHttpAccountApi, DESK_SESSION_KEY } from "./http-account-api";

const ORIGIN = "https://desk.example.test";
const CREDENTIALS = {
  companyId: "783101",
  username: "boss",
  password: "password123",
};

// 独立于实现写出的服务端投影与期望身份
const SERVER_IDENTITY = {
  user: { userId: "9", username: "boss", name: "老板", role: "console" },
  company: { companyId: "783101", companyName: "验收企业" },
  access: {
    allGroups: false,
    groups: [{ groupId: "31", groupName: "售前" }],
    accounts: [
      {
        companyChannelId: "51",
        groupId: "31",
        channel: "wechat",
        accountName: "公众号",
      },
    ],
  },
};

const SESSION: AgentSession = {
  agent: { id: "9", name: "老板", username: "boss", roleName: "企业管理员" },
  workspace: { id: "783101", name: "验收企业" },
  access: {
    allGroups: false,
    groups: [{ groupId: "31", groupName: "售前" }],
    accounts: [
      {
        companyChannelId: "51",
        groupId: "31",
        channel: "wechat",
        accountName: "公众号",
      },
    ],
  },
};

function signal() {
  return new AbortController().signal;
}

function seed(token: string, origin = ORIGIN) {
  sessionStorage.setItem(DESK_SESSION_KEY, JSON.stringify({ origin, token }));
}

function stored(): { origin: string; token: string } | null {
  const raw = sessionStorage.getItem(DESK_SESSION_KEY);
  return raw ? (JSON.parse(raw) as { origin: string; token: string }) : null;
}

function envelope(data: unknown) {
  return Response.json({ code: 0, msg: "操作成功", data });
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe("http account adapter", () => {
  it("returns no session without stored credentials and never calls the server", async () => {
    const fetcher = vi.fn();
    const api = createHttpAccountApi({ origin: ORIGIN, fetcher });

    expect(await api.getSession(signal())).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("restores the identity by asking profile with the stored token", async () => {
    seed("stored-token");
    const fetcher = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        expect(String(url)).toBe(`${ORIGIN}/api/desk/profile`);
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer stored-token",
        );
        return envelope(SERVER_IDENTITY);
      },
    );
    const api = createHttpAccountApi({ origin: ORIGIN, fetcher });

    const session = await api.getSession(signal());

    expect(session).toEqual(SESSION);
    // token 不进入界面持有的身份元数据
    expect(JSON.stringify(session)).not.toContain("stored-token");
  });

  it("ignores credentials stored for another API origin", async () => {
    seed("foreign-token", "https://other.example.test");
    const fetcher = vi.fn();
    const api = createHttpAccountApi({ origin: ORIGIN, fetcher });

    expect(await api.getSession(signal())).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("signs in anonymously, keeps the issued token and maps the company workspace", async () => {
    const fetcher = vi.fn(
      async (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).endsWith("/login")) {
          expect(init?.method).toBe("POST");
          expect(new Headers(init?.headers).has("Authorization")).toBe(false);
          expect(JSON.parse(String(init?.body))).toEqual(CREDENTIALS);
          return envelope({
            token: "issued-token",
            exp: 1800,
            ...SERVER_IDENTITY,
          });
        }
        expect(String(url)).toBe(`${ORIGIN}/api/desk/profile`);
        expect(new Headers(init?.headers).get("Authorization")).toBe(
          "Bearer issued-token",
        );
        return envelope(SERVER_IDENTITY);
      },
    );
    const api = createHttpAccountApi({ origin: ORIGIN, fetcher });

    const session = await api.signIn(CREDENTIALS, signal());

    expect(session).toEqual(SESSION);
    expect(stored()).toEqual({ origin: ORIGIN, token: "issued-token" });
    // 后续恢复不是信任本地 token，而是用同一 token 重新确认身份
    expect(await api.getSession(signal())).toEqual(SESSION);
  });

  it.each([10100, 10101, 10102, 10103])(
    "clears credentials when the stored token fails with %i",
    async (code) => {
      seed("expired-token");
      const fetcher = vi.fn(async () =>
        Response.json({ code, msg: "登录已过期，请重新登录", data: null }),
      );
      const api = createHttpAccountApi({ origin: ORIGIN, fetcher });

      await expect(api.getSession(signal())).rejects.toMatchObject({
        kind: "authentication",
        code,
      });
      expect(stored()).toBeNull();
    },
  );

  it("clears credentials on missing access but reports it apart from login failure", async () => {
    seed("platform-token");
    const fetcher = vi.fn(async () =>
      Response.json({ code: 10106, msg: "无访问权限", data: null }),
    );
    const api = createHttpAccountApi({ origin: ORIGIN, fetcher });

    await expect(api.getSession(signal())).rejects.toMatchObject({
      kind: "forbidden",
      message: "无访问权限",
    });
    expect(stored()).toBeNull();
  });

  it("keeps credentials when identity restore fails on the network or the service", async () => {
    seed("kept-token");
    const offline = createHttpAccountApi({
      origin: ORIGIN,
      fetcher: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    await expect(offline.getSession(signal())).rejects.toMatchObject({
      kind: "network",
    });
    expect(stored()).toEqual({ origin: ORIGIN, token: "kept-token" });

    const broken = createHttpAccountApi({
      origin: ORIGIN,
      fetcher: async () =>
        Response.json({ code: 10001, msg: "系统繁忙", data: null }),
    });
    await expect(broken.getSession(signal())).rejects.toMatchObject({
      kind: "business",
    });
    expect(stored()).toEqual({ origin: ORIGIN, token: "kept-token" });

    const malformed = createHttpAccountApi({
      origin: ORIGIN,
      fetcher: async () => envelope({ user: { userId: "9" }, company: {} }),
    });
    await expect(malformed.getSession(signal())).rejects.toMatchObject({
      kind: "invalid-response",
    });
    expect(stored()).toEqual({ origin: ORIGIN, token: "kept-token" });
  });

  it("keeps the in-memory session usable when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage disabled");
    });
    const fetcher = vi.fn(async (url: RequestInfo | URL) =>
      String(url).endsWith("/login")
        ? envelope({ token: "issued-token", exp: 1800, ...SERVER_IDENTITY })
        : envelope(SERVER_IDENTITY),
    );
    const api = createHttpAccountApi({ origin: ORIGIN, fetcher });

    expect(await api.signIn(CREDENTIALS, signal())).toEqual(SESSION);
    expect(await api.getSession(signal())).toEqual(SESSION);
  });

  it("clears credentials only after the server confirms the exit", async () => {
    seed("issued-token");
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toBe(`${ORIGIN}/api/desk/logout`);
      return Response.json({ code: 0, msg: "操作成功", data: null });
    });
    const api = createHttpAccountApi({ origin: ORIGIN, fetcher });

    await api.signOut(signal());

    expect(stored()).toBeNull();
  });

  it("keeps credentials when sign out fails and reports it for a retry", async () => {
    seed("issued-token");
    const offline = createHttpAccountApi({
      origin: ORIGIN,
      fetcher: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    await expect(offline.signOut(signal())).rejects.toMatchObject({
      kind: "network",
    });
    expect(stored()).toEqual({ origin: ORIGIN, token: "issued-token" });

    const refused = createHttpAccountApi({
      origin: ORIGIN,
      fetcher: async () =>
        Response.json({ code: 10001, msg: "系统繁忙", data: null }),
    });
    await expect(refused.signOut(signal())).rejects.toMatchObject({
      kind: "business",
    });
    expect(stored()).toEqual({ origin: ORIGIN, token: "issued-token" });
  });

  it("signs out locally when the token is already invalid", async () => {
    seed("expired-token");
    const api = createHttpAccountApi({
      origin: ORIGIN,
      fetcher: async () =>
        Response.json({
          code: 10103,
          msg: "登录已过期，请重新登录",
          data: null,
        }),
    });

    await api.signOut(signal());

    expect(stored()).toBeNull();
  });

  it("does not persist credentials from a superseded sign in", async () => {
    seed("old-token");
    const pending = deferred<Response>();
    const api = createHttpAccountApi({
      origin: ORIGIN,
      fetcher: (url: RequestInfo | URL) =>
        String(url).endsWith("/login")
          ? pending.promise
          : Promise.resolve(
              Response.json({ code: 0, msg: "操作成功", data: null }),
            ),
    });

    const signingIn = api.signIn(CREDENTIALS, signal());
    await api.signOut(signal());
    expect(stored()).toBeNull();

    pending.resolve(
      envelope({ token: "stale-token", exp: 1800, ...SERVER_IDENTITY }),
    );

    await expect(signingIn).rejects.toMatchObject({ kind: "aborted" });
    expect(stored()).toBeNull();
  });

  it("does not let a late restore response clear or replace the newer session", async () => {
    seed("stale-token");
    const pendingProfile = deferred<Response>();
    const api = createHttpAccountApi({
      origin: ORIGIN,
      fetcher: (url: RequestInfo | URL, init?: RequestInit) => {
        if (String(url).endsWith("/profile"))
          return new Headers(init?.headers).get("Authorization") ===
            "Bearer stale-token"
            ? pendingProfile.promise
            : Promise.resolve(envelope(SERVER_IDENTITY));
        return Promise.resolve(
          envelope({ token: "fresh-token", exp: 1800, ...SERVER_IDENTITY }),
        );
      },
    });

    const restoring = api.getSession(signal());
    await api.signIn(CREDENTIALS, signal());
    expect(stored()).toEqual({ origin: ORIGIN, token: "fresh-token" });

    pendingProfile.resolve(
      Response.json({ code: 10103, msg: "登录已过期，请重新登录", data: null }),
    );

    await expect(restoring).rejects.toMatchObject({ kind: "authentication" });
    expect(stored()).toEqual({ origin: ORIGIN, token: "fresh-token" });
    expect(await api.getSession(signal())).toEqual(SESSION);
  });
});
