import { DeskApiError, readApiEnvelope } from "./api-response";

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
    if (error instanceof Error && error.name === "AbortError") {
      throw new DeskApiError("aborted", "操作已取消");
    }
    throw new DeskApiError("network", "网络连接失败，请稍后重试");
  });
  throwIfAborted(request.signal);
  if (!response.ok) {
    throw new DeskApiError(
      response.status === 401 || response.status === 403
        ? "authentication"
        : "network",
      response.status === 401 || response.status === 403
        ? "登录已失效，请重新登录"
        : `服务请求失败（HTTP ${response.status}）`,
    );
  }
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
  } catch {
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
    if (error instanceof Error && error.name === "AbortError") {
      throw new DeskApiError("aborted", "操作已取消");
    }
    throw new DeskApiError("network", "网络连接失败，请稍后重试");
  });
  throwIfAborted(request.signal);
  if (!response.ok) {
    throw new DeskApiError(
      response.status === 401 || response.status === 403
        ? "authentication"
        : "network",
      response.status === 401 || response.status === 403
        ? "登录已失效，请重新登录"
        : `服务请求失败（HTTP ${response.status}）`,
    );
  }
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
