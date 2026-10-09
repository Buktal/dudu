import { type AccountApi, unavailableAccountApi } from "./api";

export async function loadAccountApi(): Promise<AccountApi> {
  if (import.meta.env.VITE_DESK_MOCK === "true") {
    const { createDevelopmentAccountApi } = await import("./mocks");
    return createDevelopmentAccountApi();
  }
  return unavailableAccountApi;
}
