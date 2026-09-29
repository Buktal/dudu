export type Environment = "local" | "online";
export const DEFAULT_LOCAL_ORIGIN = "http://127.0.0.1:8080";
const ENVIRONMENT_KEY = "dudu-admin.environment";

export function parseOrigin(value: string): string {
  const url = new URL(value.trim());
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error("请填写 HTTP 或 HTTPS 地址，仅包含主机和端口");
  }
  return url.origin;
}

export function readEnvironment(development: boolean) {
  const defaults = {
    environment: "local" as Environment,
    localOrigin: DEFAULT_LOCAL_ORIGIN,
  };
  if (!development) return { ...defaults, environment: "online" as const };
  try {
    const saved = JSON.parse(localStorage.getItem(ENVIRONMENT_KEY) ?? "null");
    if (
      saved &&
      (saved.environment === "local" || saved.environment === "online")
    ) {
      return {
        environment: saved.environment as Environment,
        localOrigin: parseOrigin(saved.localOrigin),
      };
    }
  } catch {
    /* 连接设置损坏或浏览器禁用存储时使用默认地址。 */
  }
  return defaults;
}

export function saveEnvironment(environment: Environment, localOrigin: string) {
  try {
    localStorage.setItem(
      ENVIRONMENT_KEY,
      JSON.stringify({ environment, localOrigin }),
    );
  } catch {
    /* 当前页面仍可使用内存中的连接设置。 */
  }
}
