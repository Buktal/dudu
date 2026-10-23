import { describe, expect, it } from "vitest";
import { createHttpInboxApi } from "./http-inbox-api";
import type { ConnectionState } from "./types";

describe("http inbox adapter", () => {
  it("reports the subscription as unavailable without login credentials", () => {
    const api = createHttpInboxApi();
    // 未登录既不发请求也不进入重连，订阅立即报不可用
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
