import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import type { ConnectionConfig } from "@/features/connections";
import { dispatchDouyin, loadRuns, saveRun } from "./api";
import type { RunRecord } from "./model";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

const connection: ConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:8080/webhooks/douyin",
  clientKey: "tt_key",
  clientSecret: "tt_secret",
};

const run: RunRecord = {
  id: "run-001",
  startedAt: "2026-09-12T01:00:00.000Z",
  source: "direct",
  steps: [
    {
      eventName: "新客问价",
      eventId: "evt-001",
      channel: "douyin",
      url: connection.url,
      payload: '{"event":"im_receive_msg","content":{"text":"你好，抖音"}}',
      signature: "a".repeat(40),
      msgId: "0f8c1b2a-3d4e-4f5a-9b8c-7d6e5f4a3b2c",
      receipt: {
        status: 200,
        elapsedMs: 12,
        body: '{"code":0}',
        error: null,
      },
      verdict: { passed: true, reason: "HTTP 200，与期望状态一致" },
    },
  ],
};

describe("runs api 契约", () => {
  it("loadRuns 调用 runs_load 命令", async () => {
    invokeMock.mockResolvedValueOnce([run]);
    await expect(loadRuns()).resolves.toEqual([run]);
    expect(invokeMock).toHaveBeenCalledWith("runs_load");
  });

  it("saveRun 调用 runs_save 并透传完整运行记录", async () => {
    invokeMock.mockResolvedValueOnce([run]);
    await expect(saveRun(run)).resolves.toEqual([run]);
    expect(invokeMock).toHaveBeenCalledWith("runs_save", { run });
  });

  it("dispatchDouyin 调用 sends_dispatch_douyin，传连接配置与明文 body", async () => {
    const body = '{"event":"im_receive_msg"}';
    const outcome = {
      msgId: "0f8c1b2a-3d4e-4f5a-9b8c-7d6e5f4a3b2c",
      signature: "a".repeat(40),
      status: 200,
      elapsedMs: 8,
      body: "ok",
      error: null,
    };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(dispatchDouyin(connection, body)).resolves.toEqual(outcome);
    expect(invokeMock).toHaveBeenCalledWith("sends_dispatch_douyin", {
      config: connection,
      body,
    });
  });
});
