import { type InboxApi, unavailableInboxApi } from "./api";

export async function loadInboxApi(): Promise<InboxApi> {
  if (import.meta.env.VITE_DESK_MOCK === "true") {
    const { createDevelopmentInboxApi, isDevelopmentScenario } = await import(
      "./development/api"
    );
    const scenario = import.meta.env.VITE_DESK_SCENARIO;
    if (scenario !== undefined && !isDevelopmentScenario(scenario)) {
      throw new Error(`未知的 desk 调试场景：${scenario}`);
    }
    return createDevelopmentInboxApi({ scenario }).api;
  }
  return unavailableInboxApi;
}
