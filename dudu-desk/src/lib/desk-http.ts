import { DeskApiError, readApiEnvelope } from "./api-response";
import { readDeskToken, resolveDeskOrigin } from "./desk-session";

export type DeskRequest<T> = {
  url: string | URL;
  /** Absent for anonymous calls (login); present for authenticated calls. */
  token?: string;
  signal: AbortSignal;
  parse: (data: unknown) => T;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  fetcher?: typeof fetch;
};

/**
 * Routes and response parsers belong to the adapter that owns them.
 *
 * Seam status: the account feature builds on this helper through
 * features/account/http-account-api.ts (anonymous login, stored-token
 * profile/logout), and the inbox adapter through
 * features/inbox/http-inbox-api.ts (stored-token visitors/query and
 * visitors/{id}/messages history). Remaining inbox capabilities are still
 * unimplemented adapters.
 */
/** fetch 层失败的统一映射：取消按 aborted，其余按网络失败。 */
function mapFetchError(error: unknown): DeskApiError {
  if (error instanceof Error && error.name === "AbortError") {
    return new DeskApiError("aborted", "操作已取消");
  }
  return new DeskApiError("network", "网络连接失败，请稍后重试");
}

/** 非 2xx 响应的统一映射：401/403 按登录失效，其余按网络失败。 */
function mapNotOk(response: Response): DeskApiError {
  return new DeskApiError(
    response.status === 401 || response.status === 403
      ? "authentication"
      : "network",
    response.status === 401 || response.status === 403
      ? "登录已失效，请重新登录"
      : `服务请求失败（HTTP ${response.status}）`,
  );
}

export async function requestDesk<T>(request: DeskRequest<T>): Promise<T> {
  throwIfAborted(request.signal);
  const response = await (request.fetcher ?? fetch)(request.url, {
    method: request.method ?? "GET",
    headers: {
      ...(request.token ? { Authorization: `Bearer ${request.token}` } : {}),
      Accept: "application/json",
      ...(request.body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body: request.body === undefined ? undefined : JSON.stringify(request.body),
    signal: request.signal,
  }).catch((error: unknown) => {
    throwIfAborted(request.signal);
    throw mapFetchError(error);
  });
  throwIfAborted(request.signal);
  if (!response.ok) throw mapNotOk(response);
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throwIfAborted(request.signal);
    throw new DeskApiError("invalid-response", "服务返回了无法识别的数据");
  }
  throwIfAborted(request.signal);
  const data = readApiEnvelope(body);
  try {
    return request.parse(data);
  } catch (error) {
    // parse 刻意抛出的 DeskApiError（如「AI 回答与当前会话不匹配」「翻译偏好响应无效」）
    // 带着准确的 kind 与文案，原样上抛；其余抛出物才是无法识别的数据结构
    if (error instanceof DeskApiError) throw error;
    throw new DeskApiError("invalid-response", "服务返回的数据格式不完整");
  }
}

type DeskBlobRequest = {
  url: string | URL;
  token?: string;
  signal: AbortSignal;
  fetcher?: typeof fetch;
};

/**
 * 认证的媒体字节请求：成功响应就是素材字节，Blob 的类型来自响应内容类型；
 * 服务端异常按统一 R 语义返回 JSON 报文，这里同样映射为 DeskApiError，
 * 使媒体失败与其它接口的错误分类一致。
 */
export async function requestDeskBlob(request: DeskBlobRequest): Promise<Blob> {
  throwIfAborted(request.signal);
  const response = await (request.fetcher ?? fetch)(request.url, {
    headers: {
      ...(request.token ? { Authorization: `Bearer ${request.token}` } : {}),
      Accept: "*/*",
    },
    signal: request.signal,
  }).catch((error: unknown) => {
    throwIfAborted(request.signal);
    throw mapFetchError(error);
  });
  throwIfAborted(request.signal);
  if (!response.ok) throw mapNotOk(response);
  const contentType = response.headers.get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throwIfAborted(request.signal);
      throw new DeskApiError("invalid-response", "服务返回了无法识别的数据");
    }
    readApiEnvelope(body);
    // code=0 的 JSON 信封不是媒体字节：如实报无效响应，不把它当素材展示
    throw new DeskApiError("invalid-response", "服务未返回媒体内容");
  }
  const blob = await response.blob();
  throwIfAborted(request.signal);
  return blob;
}

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DeskApiError("aborted", "操作已取消");
}

/** 已绑源地址的调用输入：token 与 fetcher 由调用源统一注入，调用方不再各自拼写。 */
export type DeskApiCall<T> = Omit<DeskRequest<T>, "token" | "fetcher">;
export type DeskMediaCall = Omit<DeskBlobRequest, "token" | "fetcher">;

export type DeskCaller = {
  /** 已解析的 API 源地址：socket 等不走 requestDesk 的调用仍要用它组装地址。 */
  readonly origin: string;
  /** JSON API 调用。 */
  request: <T>(request: DeskApiCall<T>) => Promise<T>;
  /** 认证的媒体字节调用。 */
  blob: (request: DeskMediaCall) => Promise<Blob>;
};

/**
 * 认证的 Desk API 调用源：解析一次源地址，之后每次调用按当前登录会话读取 token
 * 并组装认证头。「取 token + 认证头包装」只在这里写一份，translation / assistant /
 * inbox 三个适配器共用，登录与登出对后续调用即时生效。
 */
export function createDeskCaller(
  options: { origin?: string; fetcher?: typeof fetch } = {},
): DeskCaller {
  const origin = resolveDeskOrigin(options.origin);
  return {
    origin,
    request: (request) =>
      requestDesk({
        ...request,
        token: readDeskToken(origin) ?? undefined,
        fetcher: options.fetcher,
      }),
    blob: (request) =>
      requestDeskBlob({
        ...request,
        token: readDeskToken(origin) ?? undefined,
        fetcher: options.fetcher,
      }),
  };
}
