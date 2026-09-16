import { useCallback, useSyncExternalStore } from "react";

function useWorkspaceBreakpoint(query: string) {
  const subscribe = useCallback(
    (notify: () => void) => {
      const media = window.matchMedia?.(query);
      media?.addEventListener("change", notify);
      return () => media?.removeEventListener("change", notify);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}

export function useWorkspaceViewport() {
  return {
    inlineInfo: useWorkspaceBreakpoint("(min-width: 1091px)"),
    narrow: useWorkspaceBreakpoint("(max-width: 760px)"),
  };
}
