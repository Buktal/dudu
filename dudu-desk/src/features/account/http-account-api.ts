import { DeskApiError } from "@/lib/api-response";
import { requestDesk } from "@/lib/desk-http";
import type {
  AccountApi,
  AgentAccess,
  AgentSession,
  LoginCredentials,
} from "./api";

/** 凭据存储键：只保存在当前窗口会话，并绑定签发它的 API 源地址。 */
export const DESK_SESSION_KEY = "dudu-desk.session";

const ONLINE_ORIGIN_FALLBACK = "https://api.dudu.example";
const PROFILE_PATH = "/desk/profile";
const LOGIN_PATH = "/desk/login";
const LOGOUT_PATH = "/desk/logout";

// 企业员工角色仅 console/user；这里只做显示名映射，不改动服务端鉴权语义
const ROLE_NAMES: Record<string, string> = {
  console: "企业管理员",
  user: "客服坐席",
};

type StoredCredentials = { origin: string; token: string };

// 只接受协议、主机与端口的构建注入地址，禁止携带路径、凭据与查询参数
function parseOrigin(value: string): string {
  const url = new URL(value.trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error("API 源地址仅支持 HTTP 或 HTTPS 的主机与端口");
  }
  return url.origin;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0)
    throw new TypeError("缺少必要的文本字段");
  return value;
}

function parseAccess(value: unknown): AgentAccess {
  if (
    !isRecord(value) ||
    typeof value.allGroups !== "boolean" ||
    !Array.isArray(value.groups) ||
    !Array.isArray(value.accounts)
  )
    throw new TypeError("授权范围格式不完整");
  return {
    allGroups: value.allGroups,
    groups: value.groups.map((group) => {
      if (!isRecord(group)) throw new TypeError("用户组格式不完整");
      return {
        groupId: requiredText(group.groupId),
        groupName: requiredText(group.groupName),
      };
    }),
    accounts: value.accounts.map((account) => {
      if (!isRecord(account)) throw new TypeError("渠道账号格式不完整");
      return {
        companyChannelId: requiredText(account.companyChannelId),
        groupId: requiredText(account.groupId),
        channel: requiredText(account.channel),
        accountName: requiredText(account.accountName),
      };
    }),
  };
}

function parseAgent(value: unknown) {
  if (!isRecord(value)) throw new TypeError("员工格式不完整");
  const username = requiredText(value.username);
  const role = requiredText(value.role);
  return {
    id: requiredText(value.userId),
    // 显示名缺失时回落到登录名，与后端初始化员工的命名规则一致
    name:
      typeof value.name === "string" && value.name.length > 0
        ? value.name
        : username,
    username,
    roleName: ROLE_NAMES[role] ?? role,
  };
}

function parseWorkspace(value: unknown) {
  if (!isRecord(value)) throw new TypeError("企业格式不完整");
  return {
    id: requiredText(value.companyId),
    name: requiredText(value.companyName),
  };
}

function parseSession(data: unknown): AgentSession {
  if (!isRecord(data)) throw new TypeError("身份数据格式不完整");
  return {
    agent: parseAgent(data.user),
    workspace: parseWorkspace(data.company),
    access: parseAccess(data.access),
  };
}

function parseLogin(data: unknown): { token: string; session: AgentSession } {
  if (!isRecord(data)) throw new TypeError("登录数据格式不完整");
  return { token: requiredText(data.token), session: parseSession(data) };
}

// 登录失效与无访问权限都表示当前凭据不可再用；其余失败保留凭据供重试
function invalidCredentials(error: unknown): boolean {
  return (
    error instanceof DeskApiError &&
    (error.kind === "authentication" || error.kind === "forbidden")
  );
}

function storedToken(currentOrigin: string): string | null {
  try {
    const saved: unknown = JSON.parse(
      sessionStorage.getItem(DESK_SESSION_KEY) ?? "null",
    );
    if (
      isRecord(saved) &&
      saved.origin === currentOrigin &&
      typeof saved.token === "string" &&
      saved.token
    )
      return saved.token;
  } catch {
    /* 存储不可用或内容损坏时回到登录态。 */
  }
  return null;
}

/**
 * 真实企业账户适配器：token 只在本模块内存与 sessionStorage 中流转，
 * 身份恢复必须经 profile 重新确认，不能仅凭本地 token 或解码结果放行。
 */
export function createHttpAccountApi(
  options: { origin?: string; fetcher?: typeof fetch } = {},
): AccountApi {
  // 开发走 Vite 同源代理（origin 为空串），生产使用构建注入的线上地址
  const origin =
    options.origin ??
    (import.meta.env.DEV
      ? ""
      : parseOrigin(import.meta.env.VITE_API_ORIGIN ?? ONLINE_ORIGIN_FALLBACK));
  let token = storedToken(origin);
  // 凭据换代的单调计数：迟到的响应只能写回它开始时的这一代
  let generation = 0;

  function keepToken(value: string) {
    token = value;
    generation += 1;
    try {
      sessionStorage.setItem(
        DESK_SESSION_KEY,
        JSON.stringify({ origin, token: value } satisfies StoredCredentials),
      );
    } catch {
      /* 存储不可用时保持当前内存登录可用。 */
    }
  }

  function dropToken() {
    token = null;
    generation += 1;
    try {
      sessionStorage.removeItem(DESK_SESSION_KEY);
    } catch {
      /* 内存凭据已清除。 */
    }
  }

  return {
    async getSession(signal) {
      const sent = token;
      if (!sent) return null;
      const started = generation;
      try {
        return await requestDesk({
          url: `${origin}/api${PROFILE_PATH}`,
          token: sent,
          signal,
          parse: parseSession,
          fetcher: options.fetcher,
        });
      } catch (error) {
        if (generation === started && invalidCredentials(error)) dropToken();
        throw error;
      }
    },

    async signIn(credentials: LoginCredentials, signal) {
      const started = generation;
      const data = await requestDesk({
        url: `${origin}/api${LOGIN_PATH}`,
        method: "POST",
        body: credentials,
        signal,
        parse: parseLogin,
        fetcher: options.fetcher,
      });
      // 迟到的登录响应不得保存凭据：请求已取消，或期间凭据已换代
      if (generation !== started || signal.aborted)
        throw new DeskApiError("aborted", "操作已取消");
      keepToken(data.token);
      return data.session;
    },

    async signOut(signal) {
      const sent = token;
      if (!sent) return;
      const started = generation;
      try {
        await requestDesk({
          url: `${origin}/api${LOGOUT_PATH}`,
          method: "POST",
          token: sent,
          signal,
          parse: () => undefined,
          fetcher: options.fetcher,
        });
      } catch (error) {
        // 令牌已无效时同样只清理本地凭据；其他失败保留当前会话供重试
        if (!invalidCredentials(error)) throw error;
      }
      if (generation === started) dropToken();
    },
  };
}
