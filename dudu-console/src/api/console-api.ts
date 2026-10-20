import { type ConsoleClient, isEmpty } from "./client";
import { isProfile } from "./validators";
export const consoleApi = {
  profile: (client: ConsoleClient, signal: AbortSignal) =>
    client.request("/console/profile", { signal, validate: isProfile }),
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
