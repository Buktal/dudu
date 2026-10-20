import { createContext, useContext, useSyncExternalStore } from "react";
import type { ConsoleClient } from "./client";
export const ConsoleContext = createContext<ConsoleClient | null>(null);
export function useConsole() {
  const client = useContext(ConsoleContext);
  if (!client) throw new Error("ConsoleContext is required");
  return client;
}
export function useSession() {
  const client = useConsole();
  return useSyncExternalStore(client.subscribe, client.getSnapshot);
}
