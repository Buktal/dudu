import { DeskApiError } from "@/lib/api-response";
import { createDeskCaller } from "@/lib/desk-http";
import { isRecord } from "@/lib/is-record";

export type AssistantTask = "chat" | "summary" | "reply";
export type Availability = { enabled: boolean; serviceName: string | null };
export type AssistantAnswer = {
  visitorId: string;
  text: string;
  serviceName: string;
  revision: number;
  contextMessageCount: number;
  contextTruncated: boolean;
};
export type AssistantRequest = {
  prompt: string;
  task: AssistantTask;
  draft: string;
  history: { role: "user" | "assistant"; content: string }[];
};
export const MAX_PROMPT_LENGTH = 2000;
export const MAX_ANSWER_LENGTH = 4000;

export function parseAvailability(value: unknown): Availability {
  if (
    !isRecord(value) ||
    typeof value.enabled !== "boolean" ||
    (value.enabled
      ? typeof value.serviceName !== "string" || !value.serviceName.trim()
      : value.serviceName != null)
  ) {
    throw new DeskApiError("invalid-response", "AI 服务状态无效");
  }
  return {
    enabled: value.enabled,
    serviceName: value.enabled ? (value.serviceName as string) : null,
  };
}
export function parseAnswer(value: unknown): AssistantAnswer {
  if (
    !isRecord(value) ||
    typeof value.visitorId !== "string" ||
    !value.visitorId ||
    typeof value.text !== "string" ||
    !value.text.trim() ||
    value.text.length > MAX_ANSWER_LENGTH ||
    typeof value.serviceName !== "string" ||
    !value.serviceName.trim() ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 1 ||
    !Number.isSafeInteger(value.contextMessageCount) ||
    (value.contextMessageCount as number) < 0 ||
    (value.contextMessageCount as number) > 40 ||
    typeof value.contextTruncated !== "boolean"
  ) {
    throw new DeskApiError("invalid-response", "AI 回答响应无效");
  }
  return value as AssistantAnswer;
}
function request<T>(
  path: string,
  signal: AbortSignal,
  parse: (value: unknown) => T,
  body?: unknown,
) {
  // 逐请求构造：源地址解析失败（构建注入的地址非法）保持按单次调用报错，
  // 不在模块加载时打断整个应用
  const desk = createDeskCaller();
  return desk.request({
    url: `${desk.origin}/api/desk${path}`,
    method: body === undefined ? "GET" : "POST",
    signal,
    body,
    parse,
  });
}
export const assistantApi = {
  availability: (signal: AbortSignal) =>
    request("/assistant", signal, parseAvailability),
  ask: (visitorId: string, body: AssistantRequest, signal: AbortSignal) =>
    request(
      `/visitors/${encodeURIComponent(visitorId)}/assistant`,
      signal,
      (value) => {
        const answer = parseAnswer(value);
        if (answer.visitorId !== visitorId)
          throw new DeskApiError("invalid-response", "AI 回答与当前会话不匹配");
        return answer;
      },
      body,
    ),
};
