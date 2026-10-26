import { type ConsoleClient, isRecord } from "@/api/client";

export type ProviderField = {
  key: string;
  label: string;
  secret: boolean;
  required: boolean;
};
export type Provider = {
  id: string;
  name: string;
  kind: string;
  endpoint: string;
  fields: ProviderField[];
  unavailableReason: string | null;
};
export type Service = {
  id: string;
  name: string;
  provider: string;
  endpoint: string;
  values: Record<string, string>;
};
export type Settings = {
  revision: number;
  defaultService: string | null;
  services: Service[];
  providers: Provider[];
};
const isField = (value: unknown): value is ProviderField =>
  isRecord(value) &&
  typeof value.key === "string" &&
  typeof value.label === "string" &&
  typeof value.secret === "boolean" &&
  typeof value.required === "boolean";
const isProvider = (value: unknown): value is Provider =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  typeof value.kind === "string" &&
  typeof value.endpoint === "string" &&
  Array.isArray(value.fields) &&
  value.fields.every(isField) &&
  (value.unavailableReason === null ||
    typeof value.unavailableReason === "string");
const isService = (value: unknown): value is Service =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.name === "string" &&
  typeof value.provider === "string" &&
  typeof value.endpoint === "string" &&
  isRecord(value.values) &&
  Object.values(value.values).every((item) => typeof item === "string");
export const isSettings = (value: unknown): value is Settings =>
  isRecord(value) &&
  Number.isSafeInteger(value.revision) &&
  (value.defaultService === null || typeof value.defaultService === "string") &&
  Array.isArray(value.services) &&
  value.services.every(isService) &&
  Array.isArray(value.providers) &&
  value.providers.every(isProvider);
type TestResult = {
  text: string;
  serviceName: string;
  targetLanguage: string;
  revision: number;
};
const isTest = (value: unknown): value is TestResult =>
  isRecord(value) &&
  typeof value.text === "string" &&
  !!value.text.trim() &&
  typeof value.serviceName === "string" &&
  typeof value.targetLanguage === "string" &&
  typeof value.revision === "number";
export const translationApi = {
  get: (client: ConsoleClient, signal: AbortSignal) =>
    client.request("/console/translation", { signal, validate: isSettings }),
  save: (client: ConsoleClient, settings: Settings, signal: AbortSignal) =>
    client.request("/console/translation", {
      method: "PUT",
      body: {
        revision: settings.revision,
        defaultService: settings.defaultService,
        services: settings.services,
      },
      signal,
      validate: isSettings,
      write: true,
    }),
  test: (client: ConsoleClient, configuration: Service, signal: AbortSignal) =>
    client.request("/console/translation/test", {
      method: "POST",
      body: { configuration, targetLanguage: "zh" },
      signal,
      validate: isTest,
    }),
};
