import { afterEach, describe, expect, it, vi } from "vitest";
import { unavailableInboxApi } from "./api";
import { loadInboxApi } from "./runtime";
import type { ConnectionState } from "./types";

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
    "uses the real visitor adapter when the mock flag is %s",
    async (flag) => {
      vi.stubEnv("VITE_DESK_MOCK", flag);
      const api = await loadInboxApi();
      // 访客摘要查询已接入真实适配器；历史/订阅等未接入能力保持「未连接」语义
      expect(api).not.toBe(unavailableInboxApi);
      expect(api.listConversations).not.toBe(
        unavailableInboxApi.listConversations,
      );
      let connection: ConnectionState = "connecting";
      const unsubscribe = api.subscribe({
        context: { agentId: "agent-a", workspaceId: "workspace-a" },
        signal: new AbortController().signal,
        onEvent: () => {},
        onConnection: (state) => {
          connection = state;
        },
      });
      expect(connection).toBe("unavailable");
      unsubscribe();
    },
  );

  it("rejects an unknown mock scenario in a packaged build", async () => {
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_DESK_MOCK", "true");
    vi.stubEnv("VITE_DESK_SCENARIO", "unknown-scenario");
    await expect(loadInboxApi()).rejects.toThrow("未知的 desk 调试场景");
  });
});
