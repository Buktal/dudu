import { describe, expect, it } from "vitest";

import { directRunRecord, newRunId, type RunStep } from "./model";

const step: RunStep = {
  eventName: "新客问价",
  eventId: "evt-001",
  channel: "douyin",
  url: "http://127.0.0.1:8080/webhooks/douyin",
  payload: '{"event":"im_receive_msg","content":{"text":"你好，抖音"}}',
  requestBody: '{"event":"im_receive_msg","content":{"text":"你好，抖音"}}',
  expected: { status: 200, body: "", bodyMode: "contains" },
  signature: "a".repeat(40),
  msgId: "0f8c1b2a-3d4e-4f5a-9b8c-7d6e5f4a3b2c",
  receipt: {
    status: 200,
    elapsedMs: 12,
    body: '{"code":0}',
    error: null,
  },
  verdict: { passed: true, reason: "HTTP 200，与期望状态一致" },
};

describe("directRunRecord", () => {
  it("Rust 直发命令产出的成品步骤只补运行信封（direct 来源 + 事件 id + 停止标记）", () => {
    const run = directRunRecord({
      runId: "run-direct-1",
      startedAt: "2026-09-12T01:00:00.000Z",
      cancelled: false,
      step,
    });

    expect(run).toEqual({
      id: "run-direct-1",
      startedAt: "2026-09-12T01:00:00.000Z",
      source: "direct",
      sourceId: step.eventId,
      cancelled: false,
      steps: [step],
    });
  });

  it("停止标记原样落入运行记录（真实回执保留）", () => {
    const run = directRunRecord({
      runId: "run-direct-2",
      startedAt: "2026-09-12T01:00:00.000Z",
      cancelled: true,
      step: {
        ...step,
        receipt: { ...step.receipt, status: 200 },
      },
    });

    expect(run.cancelled).toBe(true);
    expect(run.steps[0].receipt.status).toBe(200);
  });

  it("newRunId 连续调用互不相同", () => {
    const ids = new Set([newRunId(), newRunId(), newRunId()]);
    expect(ids.size).toBe(3);
  });
});
