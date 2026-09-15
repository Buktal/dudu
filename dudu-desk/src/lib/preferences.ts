import { isReceptionMode, type ReceptionMode } from "./reception-mode";
import { isPalette, type Palette } from "./theme-palette";

export type WorkspacePreferences = Readonly<{
  theme: Palette;
  mode: ReceptionMode;
}>;

type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;
type PreferenceOptions = {
  storage?: () => PreferenceStorage | undefined;
  prefersDark?: () => boolean;
};

export const PREFERENCES_STORAGE_KEY = "dudu-desk.preferences";
const defaults: WorkspacePreferences = { theme: "apricot", mode: "calm" };

function safely<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    // Restricted WebViews and full storage must not block the current workspace.
    return undefined;
  }
}

function parsePreferences(
  raw: string | null | undefined,
): WorkspacePreferences {
  try {
    const record: unknown = JSON.parse(raw ?? "null");
    if (
      typeof record !== "object" ||
      record === null ||
      !("version" in record) ||
      record.version !== 1
    ) {
      return defaults;
    }
    return {
      theme:
        "theme" in record && isPalette(record.theme) ? record.theme : "apricot",
      mode:
        "mode" in record && isReceptionMode(record.mode) ? record.mode : "calm",
    };
  } catch {
    return defaults;
  }
}

export function createWorkspacePreferences({
  storage = () => window.localStorage,
  prefersDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches,
}: PreferenceOptions = {}) {
  const target = safely(storage);
  const raw = safely(() => target?.getItem(PREFERENCES_STORAGE_KEY));
  const legacy =
    raw == null ? safely(() => target?.getItem("theme")) : undefined;
  const migratedTheme =
    legacy === "dark" || (legacy === "system" && safely(prefersDark))
      ? "midnight"
      : "apricot";
  let snapshot: WorkspacePreferences =
    raw == null
      ? { theme: migratedTheme, mode: "calm" }
      : parsePreferences(raw);
  const listeners = new Set<() => void>();

  function save(next: WorkspacePreferences) {
    snapshot = next;
    safely(() =>
      target?.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify({ version: 1, theme: next.theme, mode: next.mode }),
      ),
    );
    for (const listener of listeners) listener();
  }

  if (legacy === "dark" || legacy === "light" || legacy === "system") {
    save(snapshot);
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setTheme: (theme: Palette) => {
      if (isPalette(theme) && theme !== snapshot.theme)
        save({ ...snapshot, theme });
    },
    setMode: (mode: ReceptionMode) => {
      if (isReceptionMode(mode) && mode !== snapshot.mode)
        save({ ...snapshot, mode });
    },
  };
}
