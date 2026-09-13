import { describe, expect, it } from "vitest";

import type { EventDraft } from "@/features/events";
import { buildDirectRun, newRunId } from "./model";

const draft: EventDraft = {
  id: "evt-001",
  name: "新客问价",
  channelId: "douyin",
  schemaId: "dy-text",
  payload: { event: "im_receive_msg", content: { text: "你好，抖音" } },
  senderSync: false,
  expected: { status: 200, body: "", bodyMode: "contains" },
};

describe("buildDirectRun", () => {
  it("把草稿、明文、回执快照组装为单步直发运行记录", () => {
    const body = '{"event":"im_receive_msg","content":{"text":"你好，抖音"}}';
    const run = buildDirectRun({
      draft,
      url: "http://127.0.0.1:8080/webhooks/douyin",
      body,
      outcome: {
        msgId: "0f8c1b2a-3d4e-4f5a-9b8c-7d6e5f4a3b2c",
        signature: "a".repeat(40),
        status: 200,
        elapsedMs: 12,
        body: '{"code":0}',
        error: null,
      },
      verdict: { passed: true, reason: "HTTP 200，与期望状态一致" },
      startedAt: "2026-09-12T01:00:00.000Z",
    });

    expect(run.id).toMatch(/^run-/);
    expect(run.source).toBe("direct");
    expect(run.startedAt).toBe("2026-09-12T01:00:00.000Z");
    expect(run.steps).toHaveLength(1);
    expect(run.steps[0]).toEqual({
      eventName: "新客问价",
      eventId: draft.id,
      channel: "douyin",
      url: "http://127.0.0.1:8080/webhooks/douyin",
      payload: body,
      requestBody: body,
      expected: draft.expected,
      signature: "a".repeat(40),
      msgId: "0f8c1b2a-3d4e-4f5a-9b8c-7d6e5f4a3b2c",
      receipt: {
        status: 200,
        elapsedMs: 12,
        body: '{"code":0}',
        error: null,
      },
      verdict: { passed: true, reason: "HTTP 200，与期望状态一致" },
    });
  });

  it("newRunId 连续调用互不相同", () => {
    const ids = new Set([newRunId(), newRunId(), newRunId()]);
    expect(ids.size).toBe(3);
  });
});
