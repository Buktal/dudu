import { DeskApiError, readApiEnvelope } from "./api-response";

export type DeskRequest<T> = {
  url: string | URL;
  token: string;
  signal: AbortSignal;
  parse: (data: unknown) => T;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  fetcher?: typeof fetch;
};

/** Routes and response parsers belong to the adapter implementing InboxApi. */
export async function requestDesk<T>(request: DeskRequest<T>): Promise<T> {
  throwIfAborted(request.signal);
  const response = await (request.fetcher ?? fetch)(request.url, {
    method: request.method ?? "GET",
    headers: {
      Authorization: `Bearer ${request.token}`,
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

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DeskApiError("aborted", "操作已取消");
}
