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
    "uses the real server adapter when the mock flag is %s",
    async (flag) => {
      vi.stubEnv("VITE_DESK_MOCK", flag);
      const api = await loadAccountApi();
      expect(api).not.toBe(unavailableAccountApi);
      // 未登录时既不发请求也不给出虚假身份
      expect(await api.getSession(new AbortController().signal)).toBeNull();
    },
  );
});
