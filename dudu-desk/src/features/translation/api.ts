import { DeskApiError } from "@/lib/api-response";
import { requestDesk } from "@/lib/desk-http";
import { readDeskToken, resolveDeskOrigin } from "@/lib/desk-session";
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
  if (
    !isRecord(value) ||
    typeof value.automatic !== "boolean" ||
    !languages.some(([code]) => code === value.targetLanguage)
  ) {
    throw new DeskApiError("invalid-response", "翻译偏好响应无效");
  }
  return {
    automatic: value.automatic,
    targetLanguage: value.targetLanguage as string,
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
  const origin = resolveDeskOrigin();
  return requestDesk({
    url: `${origin}/api/desk${path}`,
    method: method ?? "GET",
    body,
    token: readDeskToken(origin) ?? undefined,
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
