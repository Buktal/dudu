import { afterEach, describe, expect, it, vi } from "vitest";
import { unavailableInboxApi } from "./api";
import { loadInboxApi } from "./runtime";

afterEach(() => vi.unstubAllEnvs());

describe("inbox mock runtime", () => {
  it.each([true, false])("loads mock history with DEV=%s", async (dev) => {
    vi.stubEnv("DEV", dev);
    vi.stubEnv("VITE_DESK_MOCK", "true");
    vi.stubEnv("VITE_DESK_SCENARIO", undefined);
    const api = await loadInboxApi();
    try {
      const page = await api.listMessages({
        context: { agentId: "agent-linzhou", workspaceId: "dudu-service" },
        signal: new AbortController().signal,
        conversationId: "dev-conversation-01",
      });
      expect(page.items).toHaveLength(20);
      expect(page.nextCursor).not.toBeNull();
    } finally {
      api.dispose?.();
    }
  });

  it.each([undefined, "false", "TRUE"])(
    "keeps the real adapter boundary when the mock flag is %s",
    async (flag) => {
      vi.stubEnv("VITE_DESK_MOCK", flag);
      expect(await loadInboxApi()).toBe(unavailableInboxApi);
    },
  );

  it("rejects an unknown mock scenario in a packaged build", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_DESK_MOCK", "true");
    vi.stubEnv("VITE_DESK_SCENARIO", "unknown-scenario");
    await expect(loadInboxApi()).rejects.toThrow("未知的 desk 调试场景");
  });
});
