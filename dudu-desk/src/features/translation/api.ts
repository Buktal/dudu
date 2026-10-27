import { DeskApiError } from "@/lib/api-response";
import { createDeskCaller } from "@/lib/desk-http";
import { isRecord } from "@/lib/is-record";

export type Preference = { automatic: boolean; targetLanguage: string };
export type Translation = {
  text: string;
  targetLanguage: string;
  serviceName: string;
  revision: number;
};
export const languages = [
  ["zh", "简体中文"],
  ["zh-TW", "繁體中文"],
  ["en", "English"],
  ["ja", "日本語"],
  ["ko", "한국어"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["es", "Español"],
  ["ru", "Русский"],
  ["pt", "Português"],
  ["it", "Italiano"],
  ["ar", "العربية"],
  ["th", "ไทย"],
  ["vi", "Tiếng Việt"],
  ["id", "Bahasa Indonesia"],
] as const;

export function parsePreference(value: unknown): Preference {
  // 语言代码只校验非空字符串：服务端新增语言时旧客户端原样往返，
  // 不因客户端词表缺失而让整个偏好面板报错（Select 已能兜底显示未知代码）
  if (
    !isRecord(value) ||
    typeof value.automatic !== "boolean" ||
    typeof value.targetLanguage !== "string" ||
    !value.targetLanguage
  ) {
    throw new DeskApiError("invalid-response", "翻译偏好响应无效");
  }
  return {
    automatic: value.automatic,
    targetLanguage: value.targetLanguage,
  };
}
export function parseTranslation(value: unknown): Translation {
  if (
    !isRecord(value) ||
    typeof value.text !== "string" ||
    !value.text.trim() ||
    typeof value.targetLanguage !== "string" ||
    typeof value.serviceName !== "string" ||
    typeof value.revision !== "number"
  ) {
    throw new DeskApiError("invalid-response", "翻译结果响应无效");
  }
  return {
    text: value.text,
    targetLanguage: value.targetLanguage,
    serviceName: value.serviceName,
    revision: value.revision,
  };
}
function request<T>(
  path: string,
  parse: (value: unknown) => T,
  signal: AbortSignal,
  body?: unknown,
  method?: "PUT" | "POST",
) {
  // 逐请求构造：源地址解析失败（构建注入的地址非法）保持按单次调用报错，
  // 不在模块加载时打断整个应用
  const desk = createDeskCaller();
  return desk.request({
    url: `${desk.origin}/api/desk${path}`,
    method: method ?? "GET",
    body,
    signal,
    parse,
  });
}
export const translationApi = {
  preference: (signal: AbortSignal) =>
    request("/translation/preferences", parsePreference, signal),
  save: (body: Preference, signal: AbortSignal) =>
    request("/translation/preferences", parsePreference, signal, body, "PUT"),
  translate: (
    id: string,
    version: number,
    language: string,
    signal: AbortSignal,
  ) =>
    request(
      `/messages/${encodeURIComponent(id)}/translation`,
      parseTranslation,
      signal,
      { version, targetLanguage: language },
      "POST",
    ),
};
