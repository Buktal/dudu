import { afterEach, describe, expect, it, vi } from "vitest";
import { unavailableAccountApi } from "./api";
import { loadAccountApi } from "./runtime";

afterEach(() => vi.unstubAllEnvs());

describe("account mock runtime", () => {
  it.each([true, false])(
    "restores a mock identity with DEV=%s",
    async (dev) => {
      vi.stubEnv("DEV", dev);
      vi.stubEnv("VITE_DESK_MOCK", "true");
      const api = await loadAccountApi();
      const session = await api.getSession(new AbortController().signal);
      expect(session?.agent.id).toBe("agent-linzhou");
      expect(session?.workspace.id).toBe("dudu-service");
    },
  );

  it.each([undefined, "false", "TRUE"])(
    "keeps the real adapter boundary when the mock flag is %s",
    async (flag) => {
      vi.stubEnv("VITE_DESK_MOCK", flag);
      expect(await loadAccountApi()).toBe(unavailableAccountApi);
    },
  );
});
