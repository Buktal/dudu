import { describe, expect, it } from "vitest";
import { unavailableInboxApi } from "./api";
import { loadInboxApi } from "./runtime";
import type { ConnectionState } from "./types";

describe("inbox runtime", () => {
  it("loads the real visitor adapter", async () => {
    const api = await loadInboxApi();
    // 真实适配器是唯一实现：不是未接入降级适配器，历史与订阅方法均已接入
    expect(api).not.toBe(unavailableInboxApi);
    expect(api.listConversations).not.toBe(
      unavailableInboxApi.listConversations,
    );
  });

  it("reports the subscription as unavailable without login credentials", async () => {
    const api = await loadInboxApi();
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
  });
});
