/**
 * 真实适配器共用的登录会话协议：token 只保存在当前窗口会话（sessionStorage），
 * 并与签发它的 API 源地址绑定；账户适配器负责写入与清除，访客/消息适配器按请求读取。
 * 源地址解析与存储形状只在此处定义，账户与 inbox 不再各写一份。
 */
import { isRecord } from "@/lib/is-record";

export const DESK_SESSION_KEY = "dudu-desk.session";

const ONLINE_ORIGIN_FALLBACK = "https://api.dudu.example";

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

/** 开发走 Vite 同源代理（origin 为空串），打包使用构建注入的线上地址。 */
export function resolveDeskOrigin(origin?: string): string {
  return (
    origin ??
    (import.meta.env.DEV
      ? ""
      : parseOrigin(import.meta.env.VITE_API_ORIGIN ?? ONLINE_ORIGIN_FALLBACK))
  );
}

/** 当前源地址下已保存的 token；没有或存储不可用时返回 null。 */
export function readDeskToken(origin: string): string | null {
  try {
    const saved: unknown = JSON.parse(
      sessionStorage.getItem(DESK_SESSION_KEY) ?? "null",
    );
    if (
      isRecord(saved) &&
      saved.origin === origin &&
      typeof saved.token === "string" &&
      saved.token
    )
      return saved.token;
  } catch {
    /* 存储不可用或内容损坏时视为未登录。 */
  }
  return null;
}

/** 保存登录凭据；存储不可用时仅保内存由调用方持有。 */
export function storeDeskToken(origin: string, token: string): void {
  try {
    sessionStorage.setItem(
      DESK_SESSION_KEY,
      JSON.stringify({ origin, token } satisfies StoredCredentials),
    );
  } catch {
    /* 保持当前内存登录可用。 */
  }
}

/** 清除本地凭据。 */
export function clearDeskToken(): void {
  try {
    sessionStorage.removeItem(DESK_SESSION_KEY);
  } catch {
    /* 内存凭据由调用方清除。 */
  }
}
