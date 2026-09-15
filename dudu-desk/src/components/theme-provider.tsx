import * as React from "react";
import {
  createWorkspacePreferences,
  type WorkspacePreferences,
} from "@/lib/preferences";
import type { ReceptionMode } from "@/lib/reception-mode";
import { type Palette, palettes } from "@/lib/theme-palette";

type ThemeProviderState = WorkspacePreferences & {
  setTheme: (theme: Palette) => void;
  setMode: (mode: ReceptionMode) => void;
};

const ThemeProviderContext = React.createContext<
  ThemeProviderState | undefined
>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [preferences] = React.useState(createWorkspacePreferences);
  const snapshot = React.useSyncExternalStore(
    preferences.subscribe,
    preferences.getSnapshot,
  );

  React.useLayoutEffect(() => {
    const root = document.documentElement;
    const scheme = palettes[snapshot.theme].scheme;
    root.dataset.palette = snapshot.theme;
    root.classList.remove("light");
    root.classList.toggle("dark", scheme === "dark");
    root.style.colorScheme = scheme;
  }, [snapshot.theme]);

  const value = React.useMemo(
    () => ({
      ...snapshot,
      setTheme: preferences.setTheme,
      setMode: preferences.setMode,
    }),
    [snapshot, preferences],
  );

  return <ThemeProviderContext value={value}>{children}</ThemeProviderContext>;
}

export function useTheme() {
  const context = React.useContext(ThemeProviderContext);
  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");
  return context;
}
