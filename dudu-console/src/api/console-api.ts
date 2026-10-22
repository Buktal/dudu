import { type ConsoleClient, isEmpty } from "./client";
export const consoleApi = {
  changePassword: (
    client: ConsoleClient,
    oldPassword: string,
    newPassword: string,
    signal: AbortSignal,
  ) =>
    client.request("/console/profile/password", {
      method: "PUT",
      body: { oldPassword, newPassword },
      signal,
      validate: isEmpty,
    }),
};
