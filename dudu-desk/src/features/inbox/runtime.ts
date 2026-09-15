import { type InboxApi, unavailableInboxApi } from "./api";

export async function loadInboxApi(): Promise<InboxApi> {
  if (import.meta.env.DEV && import.meta.env.VITE_DESK_MOCK === "true") {
    const { createDevelopmentInboxApi } = await import("./development-api");
    return createDevelopmentInboxApi({
      scenario: import.meta.env.VITE_DESK_SCENARIO,
    }).api;
  }
  return unavailableInboxApi;
}
