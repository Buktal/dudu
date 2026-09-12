import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import {
  type ConnectionConfig,
  loadConnections,
  saveConnection,
  testDouyinConnection,
} from "./api";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

const douyinConfig: ConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:8080/webhooks/douyin",
  clientKey: "mock_client_key",
  clientSecret: "mock_client_secret",
};

describe("connections api 契约", () => {
  it("loadConnections 调用 connections_load 命令", async () => {
    invokeMock.mockResolvedValueOnce([douyinConfig]);
    await expect(loadConnections()).resolves.toEqual([douyinConfig]);
    expect(invokeMock).toHaveBeenCalledWith("connections_load");
  });

  it("saveConnection 调用 connections_save 并透传 camelCase 配置", async () => {
    invokeMock.mockResolvedValueOnce([douyinConfig]);
    await saveConnection(douyinConfig);
    expect(invokeMock).toHaveBeenCalledWith("connections_save", {
      config: douyinConfig,
    });
  });

  it("testDouyinConnection 调用 connections_test_douyin 并透传配置", async () => {
    const outcome = { ok: true, message: "challenge 回显一致" };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(testDouyinConnection(douyinConfig)).resolves.toEqual(outcome);
    expect(invokeMock).toHaveBeenCalledWith("connections_test_douyin", {
      config: douyinConfig,
    });
  });
});
