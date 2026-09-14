import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import {
  type ConnectionConfig,
  type DouyinConnectionConfig,
  loadConnections,
  saveConnection,
  testDouyinConnection,
  testWecomConnection,
  type WecomConnectionConfig,
} from "./api";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

const douyinConfig: DouyinConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:8080/webhooks/douyin",
  system: "dop",
  clientKey: "mock_client_key",
  clientSecret: "mock_client_secret",
  miniGameToken: "",
  isvToken: "",
  isvKey: "",
};

const wecomConfig: WecomConnectionConfig = {
  channel: "wecom",
  url: "http://127.0.0.1:8080/webhooks/wecom",
  system: "agent",
  corpId: "ww_mock_corp",
  token: "mock_token",
  encodingAesKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
  agentId: "1000002",
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

  it("testWecomConnection 调用 connections_test_wecom 并透传配置", async () => {
    const outcome = { ok: true, message: "echostr 握手成功" };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(testWecomConnection(wecomConfig)).resolves.toEqual(outcome);
    expect(invokeMock).toHaveBeenCalledWith("connections_test_wecom", {
      config: wecomConfig,
    });
  });

  it("saveConnection 的返回列表可同时携带抖音与企微（按 channel 区分形状）", async () => {
    const list: ConnectionConfig[] = [douyinConfig, wecomConfig];
    invokeMock.mockResolvedValueOnce(list);
    await expect(saveConnection(wecomConfig)).resolves.toEqual(list);
    expect(invokeMock).toHaveBeenCalledWith("connections_save", {
      config: wecomConfig,
    });
  });
});
