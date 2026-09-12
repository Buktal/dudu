import { describe, expect, it } from "vitest";

import type { ChannelId } from "@/lib/channels";

import type { RunRecord, RunStep } from "./model";
import { filterRuns, type RunFilters, runStatus } from "./selectors";

function step(channel: ChannelId, overrides: Partial<RunStep> = {}): RunStep {
  return {
    eventName: "新客问价",
    eventId: "evt-1",
    channel,
    url: "http://127.0.0.1:8080/hook",
    payload: "{}",
    signature: "a".repeat(40),
    msgId: "m-1",
    receipt: { status: 200, elapsedMs: 5, body: "ok", error: null },
    verdict: { passed: true, reason: "HTTP 200，与期望状态一致" },
    ...overrides,
  };
}

const directPass: RunRecord = {
  id: "run-1",
  startedAt: "2026-09-12T01:00:00.000Z",
  source: "direct",
  steps: [step("douyin")],
};

const scenarioFail: RunRecord = {
  id: "run-2",
  startedAt: "2026-09-12T02:00:00.000Z",
  source: "scenario",
  scenarioName: "抖音接待",
  steps: [
    step("douyin"),
    step("douyin", {
      verdict: { passed: false, reason: "HTTP 500，期望 HTTP 200" },
      receipt: { status: 500, elapsedMs: 5, body: "boom", error: null },
    }),
    step("douyin", {
      skipped: true,
      signature: "",
      msgId: "",
      verdict: { passed: false, reason: "前序步骤失败，本步骤未执行" },
      receipt: { status: 0, elapsedMs: 0, body: "", error: null },
    }),
  ],
};

const wecomPass: RunRecord = {
  id: "run-3",
  startedAt: "2026-09-12T03:00:00.000Z",
  source: "scenario",
  scenarioName: "企微接待",
  steps: [step("wecom")],
};

const ALL: RunRecord[] = [directPass, scenarioFail, wecomPass];
const NO_FILTERS: RunFilters = { status: "all", channel: "all" };

describe("运行记录筛选 selector", () => {
  it("runStatus：任一步骤未通过（含 skipped）即失败", () => {
    expect(runStatus(directPass)).toBe("passed");
    expect(runStatus(scenarioFail)).toBe("failed");
    expect(runStatus(wecomPass)).toBe("passed");
  });

  it("无筛选：全部按原序返回，行携带渠道/来源标识/步骤计数", () => {
    const rows = filterRuns(ALL, NO_FILTERS);
    expect(rows.map((row) => row.run.id)).toEqual(["run-1", "run-2", "run-3"]);
    expect(rows[0]).toMatchObject({
      channel: "douyin",
      status: "passed",
      sourceLabel: "直发",
      stepCount: 1,
    });
    expect(rows[1]).toMatchObject({
      sourceLabel: "剧本",
      scenarioName: "抖音接待",
      stepCount: 3,
      passedCount: 1,
    });
    expect(rows[2].channel).toBe("wecom");
  });

  it("按状态筛选：passed 只留全部通过的运行", () => {
    const rows = filterRuns(ALL, { ...NO_FILTERS, status: "passed" });
    expect(rows.map((row) => row.run.id)).toEqual(["run-1", "run-3"]);
  });

  it("按状态筛选：failed 留含失败步骤的运行", () => {
    const rows = filterRuns(ALL, { ...NO_FILTERS, status: "failed" });
    expect(rows.map((row) => row.run.id)).toEqual(["run-2"]);
  });

  it("按渠道筛选：douyin 只留抖音运行（取首步渠道）", () => {
    const rows = filterRuns(ALL, { ...NO_FILTERS, channel: "douyin" });
    expect(rows.map((row) => row.run.id)).toEqual(["run-1", "run-2"]);
  });

  it("状态与渠道组合筛选", () => {
    const rows = filterRuns(ALL, { status: "passed", channel: "wecom" });
    expect(rows.map((row) => row.run.id)).toEqual(["run-3"]);
  });

  it("空运行（无步骤）不炸：状态视为失败、渠道未知不匹配渠道筛选", () => {
    const empty: RunRecord = {
      id: "run-empty",
      startedAt: "2026-09-12T04:00:00.000Z",
      source: "direct",
      steps: [],
    };
    expect(runStatus(empty)).toBe("failed");
    const rows = filterRuns([empty], { ...NO_FILTERS, channel: "douyin" });
    expect(rows).toHaveLength(0);
  });
});
