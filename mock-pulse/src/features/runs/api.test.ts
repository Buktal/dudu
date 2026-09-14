import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import type { ConnectionConfig } from "@/features/connections";
import type { ExpectedReceipt } from "@/features/events";
import { dispatchDirect, loadRuns, saveRun, startScenarioRun } from "./api";
import type { RunRecord } from "./model";
import type { RunSnapshot } from "./snapshot";

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

  it("dispatchDirect 调用 sends_dispatch_direct，传连接、明文与事件/期望快照", async () => {
    const body = '{"event":"im_receive_msg"}';
    const expected: ExpectedReceipt = {
      status: 200,
      body: "",
      bodyMode: "contains",
    };
    const outcome = {
      step: {
        eventName: "新客问价",
        eventId: "evt-001",
        channel: "douyin" as const,
        url: connection.url,
        payload: body,
        requestBody: body,
        expected,
        signature: "a".repeat(40),
        msgId: "0f8c1b2a-3d4e-4f5a-9b8c-7d6e5f4a3b2c",
        receipt: { status: 200, elapsedMs: 8, body: "ok", error: null },
        verdict: { passed: true, reason: "HTTP 200，正文包含「ok」" },
      },
      cancelled: false,
    };
    invokeMock.mockResolvedValueOnce(outcome);
    await expect(
      dispatchDirect(connection, {
        body,
        eventName: "新客问价",
        eventId: "evt-001",
        expected,
        runId: "run-1",
      }),
    ).resolves.toEqual(outcome);
    expect(invokeMock).toHaveBeenCalledWith("sends_dispatch_direct", {
      config: connection,
      body,
      eventName: "新客问价",
      eventId: "evt-001",
      expected,
      runId: "run-1",
    });
  });

  it("startScenarioRun 调用 start_scenario_run，传快照与连接列表，返回 run id", async () => {
    const snapshot: RunSnapshot = {
      runId: "run-x1",
      scenarioId: "scn-1",
      scenarioName: "抖音接待",
      startedAt: "2026-09-12T03:00:00.000Z",
      steps: [
        {
          eventName: "新客问价",
          eventId: "evt-001",
          channel: "douyin",
          expected: { status: 200, body: "", bodyMode: "contains" },
          body: '{"event":"im_receive_msg"}',
        },
      ],
    };
    invokeMock.mockResolvedValueOnce("run-x1");

    await expect(startScenarioRun(snapshot, [connection])).resolves.toBe(
      "run-x1",
    );
    expect(invokeMock).toHaveBeenCalledWith("start_scenario_run", {
      snapshot,
      connections: [connection],
    });
  });
});
