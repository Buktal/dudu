import { describe, expect, it } from "vitest";
import { createWorkspacePreferences } from "./preferences";
import type { ReceptionMode } from "./reception-mode";
import type { Palette } from "./theme-palette";

function memoryStorage(entries: Record<string, string> = {}) {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("workspace preferences", () => {
  it("restores reduced motion alongside existing preferences and can follow the system again", () => {
    const storage = memoryStorage();
    const first = createWorkspacePreferences({ storage: () => storage });
    first.setTheme("midnight");
    first.setMode("parallel");
    first.setReduceMotion(true);
    const restored = createWorkspacePreferences({ storage: () => storage });
    expect(restored.getSnapshot()).toEqual({
      theme: "midnight",
      mode: "parallel",
      reduceMotion: true,
    });
    restored.setReduceMotion(false);
    expect(
      createWorkspacePreferences({ storage: () => storage }).getSnapshot(),
    ).toEqual({ theme: "midnight", mode: "parallel" });
  });

  it("ignores invalid motion values without discarding valid theme and mode preferences", () => {
    const storage = memoryStorage({
      "dudu-desk.preferences":
        '{"version":1,"theme":"sea","mode":"quick","reduceMotion":"true"}',
    });
    const preferences = createWorkspacePreferences({ storage: () => storage });
    preferences.setReduceMotion("true" as unknown as boolean);
    expect(preferences.getSnapshot()).toEqual({ theme: "sea", mode: "quick" });
  });

  it("starts a new workspace in daylight and calm without browser storage", () => {
    const preferences = createWorkspacePreferences({
      storage: () => undefined,
    });

    expect(preferences.getSnapshot()).toEqual({
      theme: "daylight",
      mode: "calm",
    });
  });

  it("restores the chosen theme and reception mode in a new workspace", () => {
    const storage = memoryStorage();
    const first = createWorkspacePreferences({ storage: () => storage });

    first.setTheme("sea");
    first.setMode("parallel");
    const reopened = createWorkspacePreferences({ storage: () => storage });

    expect(reopened.getSnapshot()).toEqual({ theme: "sea", mode: "parallel" });
  });

  it.each([
    [
      '{"version":1,"theme":"midnight","mode":"quick","draft":"private","pinned":"old"}',
      { theme: "midnight", mode: "quick" },
    ],
    [
      '{"version":1,"theme":"sea","mode":"fold"}',
      { theme: "sea", mode: "calm" },
    ],
    [
      '{"version":1,"theme":"graphite","mode":"parallel","reduceMotion":true}',
      { theme: "daylight", mode: "parallel", reduceMotion: true },
    ],
    [
      '{"version":1,"theme":"fog","mode":"quick"}',
      { theme: "daylight", mode: "quick" },
    ],
    [
      '{"version":1,"theme":"constructor","mode":"parallel"}',
      { theme: "daylight", mode: "parallel" },
    ],
    [
      '{"version":2,"theme":"sea","mode":"parallel"}',
      { theme: "daylight", mode: "calm" },
    ],
    ['{"theme":"sea","mode":"parallel"}', { theme: "daylight", mode: "calm" }],
    ["null", { theme: "daylight", mode: "calm" }],
    ["[]", { theme: "daylight", mode: "calm" }],
    ["damaged-json", { theme: "daylight", mode: "calm" }],
  ])(
    "restores only recognized preferences from a supported record: %s",
    (raw, expected) => {
      const storage = memoryStorage({ "dudu-desk.preferences": raw });
      const preferences = createWorkspacePreferences({
        storage: () => storage,
      });

      expect(preferences.getSnapshot()).toEqual(expected);
    },
  );

  it.each(["crimson", "citrus"] as const)(
    "restores the new %s theme without changing other preferences",
    (theme) => {
      const storage = memoryStorage();
      const preferences = createWorkspacePreferences({
        storage: () => storage,
      });
      preferences.setMode("parallel");
      preferences.setReduceMotion(true);
      preferences.setTheme(theme);

      expect(
        createWorkspacePreferences({ storage: () => storage }).getSnapshot(),
      ).toEqual({ theme, mode: "parallel", reduceMotion: true });
    },
  );

  it.each([
    ["dark", false, "midnight"],
    ["light", true, "daylight"],
    ["system", true, "midnight"],
    ["system", false, "daylight"],
  ] as const)(
    "migrates %s once using the initial system appearance",
    (legacy, prefersDark, theme) => {
      const storage = memoryStorage({ theme: legacy });
      const first = createWorkspacePreferences({
        storage: () => storage,
        prefersDark: () => prefersDark,
      });
      const reopened = createWorkspacePreferences({
        storage: () => storage,
        prefersDark: () => !prefersDark,
      });

      expect([first.getSnapshot(), reopened.getSnapshot()]).toEqual([
        { theme, mode: "calm" },
        { theme, mode: "calm" },
      ]);
    },
  );

  it.each([
    [
      "access",
      () => {
        throw new Error("Storage blocked");
      },
    ],
    [
      "read",
      () => ({
        getItem: (): string | null => {
          throw new Error("Storage unreadable");
        },
        setItem: (): void => {},
      }),
    ],
    [
      "write",
      () => ({
        getItem: (): string | null => null,
        setItem: (): void => {
          throw new Error("Quota exceeded");
        },
      }),
    ],
  ] as const)(
    "keeps the current workspace usable when storage %s fails",
    (_, storage) => {
      const preferences = createWorkspacePreferences({ storage });

      preferences.setTheme("pine");
      preferences.setMode("quick");

      expect(preferences.getSnapshot()).toEqual({
        theme: "pine",
        mode: "quick",
      });
    },
  );

  it("publishes changed preferences until the consumer unsubscribes", () => {
    const preferences = createWorkspacePreferences({
      storage: () => undefined,
    });
    const observed: unknown[] = [];
    const unsubscribe = preferences.subscribe(() =>
      observed.push(preferences.getSnapshot()),
    );

    preferences.setTheme("berry");
    preferences.setTheme("berry");
    preferences.setMode("quick");
    unsubscribe();
    preferences.setTheme("daylight");

    expect(observed).toEqual([
      { theme: "berry", mode: "calm" },
      { theme: "berry", mode: "quick" },
    ]);
  });

  it("rejects unsupported theme and mode values at the preference write boundary", () => {
    const storage = memoryStorage();
    const preferences = createWorkspacePreferences({ storage: () => storage });
    preferences.setTheme("iris");
    preferences.setMode("parallel");

    preferences.setTheme("old-theme" as Palette);
    preferences.setMode("fold" as ReceptionMode);

    expect([
      preferences.getSnapshot(),
      createWorkspacePreferences({ storage: () => storage }).getSnapshot(),
    ]).toEqual([
      { theme: "iris", mode: "parallel" },
      { theme: "iris", mode: "parallel" },
    ]);
  });
});
