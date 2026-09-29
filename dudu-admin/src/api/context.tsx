import { createContext, useContext, useSyncExternalStore } from "react";
import type { AdminClient } from "./client";

export const AdminContext = createContext<AdminClient | null>(null);
export function useAdmin() {
  const client = useContext(AdminContext);
  if (!client) throw new Error("AdminContext is required");
  return client;
}
export function useSession() {
  const client = useAdmin();
  return useSyncExternalStore(client.subscribe, client.getSnapshot);
}
