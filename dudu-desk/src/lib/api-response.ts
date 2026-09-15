export type ApiErrorKind =
  | "authentication"
  | "business"
  | "invalid-response"
  | "unavailable"
  | "network"
  | "aborted";

export type ApiFailure = {
  kind: ApiErrorKind;
  message: string;
  code?: number;
};

export class DeskApiError extends Error {
  constructor(
    public readonly kind: ApiErrorKind,
    message: string,
    public readonly code?: number,
  ) {
    super(message);
    this.name = "DeskApiError";
  }
}

export function readApiEnvelope(response: unknown): unknown {
  if (
    response === null ||
    typeof response !== "object" ||
    !("code" in response) ||
    typeof response.code !== "number" ||
    !Number.isInteger(response.code) ||
    !("msg" in response) ||
    typeof response.msg !== "string" ||
    !("data" in response)
  ) {
    throw new DeskApiError("invalid-response", "服务返回了无法识别的数据");
  }
  const code = response.code;
  const message = response.msg;
  if (code !== 0) {
    throw new DeskApiError(
      code >= 10100 && code < 10200 ? "authentication" : "business",
      message,
      code,
    );
  }
  return response.data;
}
