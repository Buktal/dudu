import { describe, expect, it } from "vitest";

import type { ChannelId } from "@/lib/channels";

import type { RunRecord, RunStep } from "./model";
import {
  filterRuns,
  laneGroups,
  lastRunFor,
  type RunFilters,
  runStatus,
  selectedRun,
} from "./selectors";

/** 只带查询词的默认筛选（来源/结果为 all，与 slice 初始态一致） */
const query = (value: string): RunFilters => ({
  query: value,
  source: "all",
  outcome: "all",
});

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

describe("运行状态与选中 selector", () => {
  it("runStatus：任一步骤未通过（含 skipped）即失败；空运行视为失败", () => {
    expect(runStatus(directPass)).toBe("passed");
    expect(runStatus(scenarioFail)).toBe("failed");
    expect(runStatus(wecomPass)).toBe("passed");
    expect(runStatus({ ...directPass, steps: [] })).toBe("failed");
  });

  it("selectedRun：选中命中；未选中或 id 未命中回退最新一条", () => {
    expect(selectedRun({ items: ALL, selectedId: "run-2" })?.id).toBe("run-2");
    expect(selectedRun({ items: ALL })?.id).toBe("run-3");
    expect(selectedRun({ items: ALL, selectedId: "gone" })?.id).toBe("run-3");
    expect(selectedRun({ items: [] })).toBeUndefined();
  });
});

describe("运行记录筛选 selector（查询分词 + 干草堆）", () => {
  it("空查询返回全部；列表按开始时间倒序（新→旧）", () => {
    expect(filterRuns(ALL, query("")).map((run) => run.id)).toEqual([
      "run-3",
      "run-2",
      "run-1",
    ]);
    expect(filterRuns(ALL, query("   "))).toHaveLength(3);
  });

  it("查询按空白分词，全部词命中才保留（AND）", () => {
    expect(filterRuns(ALL, query("抖音 接待")).map((run) => run.id)).toEqual([
      "run-2",
    ]);
    expect(filterRuns(ALL, query("抖音 企微"))).toEqual([]);
  });

  it("命中 id / 编排名 / 剧本名，大小写不敏感", () => {
    expect(filterRuns(ALL, query("run-1")).map((run) => run.id)).toEqual([
      "run-1",
    ]);
    expect(filterRuns(ALL, query("接待")).map((run) => run.id)).toEqual([
      "run-3",
      "run-2",
    ]);
  });

  it("状态词匹配：成功/通过命中全通过；失败/未通过命中含失败步骤（「未通过」含「通过」的子串语义）", () => {
    expect(filterRuns(ALL, query("成功")).map((run) => run.id)).toEqual([
      "run-3",
      "run-1",
    ]);
    expect(filterRuns(ALL, query("失败")).map((run) => run.id)).toEqual([
      "run-2",
    ]);
    expect(filterRuns(ALL, query("未通过")).map((run) => run.id)).toEqual([
      "run-2",
    ]);
    expect(filterRuns(ALL, query("通过")).map((run) => run.id)).toEqual([
      "run-3",
      "run-2",
      "run-1",
    ]);
  });

  it("命中步骤事件名与渠道名", () => {
    // 三条运行的首步事件名都是「新客问价」（fixture 默认）
    expect(filterRuns(ALL, query("新客问价")).map((run) => run.id)).toEqual([
      "run-3",
      "run-2",
      "run-1",
    ]);
    expect(filterRuns(ALL, query("企业微信")).map((run) => run.id)).toEqual([
      "run-3",
    ]);
  });
});

describe("来源/结果筛选（slice 维度：来源与结果先收敛，查询词继续过滤）", () => {
  const filters = (partial: Partial<RunFilters>): RunFilters => ({
    query: "",
    source: "all",
    outcome: "all",
    ...partial,
  });

  it("source 维：direct / scenario 命中各自来源，plan 无记录", () => {
    expect(
      filterRuns(ALL, filters({ source: "direct" })).map((run) => run.id),
    ).toEqual(["run-1"]);
    expect(
      filterRuns(ALL, filters({ source: "scenario" })).map((run) => run.id),
    ).toEqual(["run-3", "run-2"]);
    expect(
      filterRuns(ALL, filters({ source: "plan" })).map((run) => run.id),
    ).toEqual([]);
  });

  it("outcome 维：passed 排除失败；failed 只留失败；cancelled 只留停止", () => {
    expect(
      filterRuns(ALL, filters({ outcome: "passed" })).map((run) => run.id),
    ).toEqual(["run-3", "run-1"]);
    expect(
      filterRuns(ALL, filters({ outcome: "failed" })).map((run) => run.id),
    ).toEqual(["run-2"]);
    expect(
      filterRuns(ALL, filters({ outcome: "cancelled" })).map((run) => run.id),
    ).toEqual([]);
    const stopped: RunRecord = {
      ...directPass,
      id: "run-stop",
      cancelled: true,
    };
    expect(
      filterRuns([stopped, ...ALL], filters({ outcome: "cancelled" })).map(
        (run) => run.id,
      ),
    ).toEqual(["run-stop"]);
  });

  it("维度组合：source 与 outcome、查询词叠加生效", () => {
    expect(
      filterRuns(ALL, filters({ source: "scenario", outcome: "failed" })).map(
        (run) => run.id,
      ),
    ).toEqual(["run-2"]);
    expect(
      filterRuns(ALL, filters({ source: "scenario", query: "企微" })).map(
        (run) => run.id,
      ),
    ).toEqual(["run-3"]);
  });
});

describe("lastRunFor（最近一次同源运行）", () => {
  const scnRunA = { ...scenarioFail, sourceId: "scn-a" };
  const scnRunB = { ...wecomPass, sourceId: "scn-a" };
  const planRunA = {
    ...directPass,
    source: "plan" as const,
    sourceId: "plan-1",
  };

  it("同 source + sourceId 取最新一条", () => {
    const items = [scnRunA, scnRunB, planRunA];
    expect(lastRunFor({ items }, "scenario", "scn-a")?.id).toBe("run-3");
  });

  it("种类或来源 id 不同不命中", () => {
    const items = [scnRunA, planRunA];
    expect(lastRunFor({ items }, "plan", "scn-a")).toBeUndefined();
    expect(lastRunFor({ items }, "scenario", "scn-b")).toBeUndefined();
    expect(lastRunFor({ items: [] }, "scenario", "scn-a")).toBeUndefined();
  });
});

/** 编排运行记录：两 lane 各两步（lane 归属由 Rust 执行器写入） */
const planRun: RunRecord = {
  id: "run-plan",
  startedAt: "2026-09-12T05:00:00.000Z",
  source: "plan",
  planName: "双平台接待回归",
  steps: [
    step("douyin", {
      laneIndex: 0,
      laneName: "抖音接待",
      eventName: "进入会话",
    }),
    step("douyin", {
      laneIndex: 0,
      laneName: "抖音接待",
      eventName: "新客问价",
      verdict: { passed: false, reason: "HTTP 500，期望 HTTP 200" },
      receipt: { status: 500, elapsedMs: 5, body: "boom", error: null },
    }),
    step("wecom", {
      laneIndex: 1,
      laneName: "企微接待",
      eventName: "企微文本",
      skipped: true,
      verdict: {
        passed: false,
        reason: "其他剧本已失败，编排停止，本剧本未执行",
      },
      receipt: { status: 0, elapsedMs: 0, body: "", error: null },
    }),
  ],
};

describe("编排运行记录 selector", () => {
  it("干草堆携带编排名，可按名称命中编排运行", () => {
    expect(filterRuns([planRun], query("双平台")).map((run) => run.id)).toEqual(
      ["run-plan"],
    );
  });

  it("laneGroups：按 laneIndex 分组、组间按 lane 序号、组内保序", () => {
    const groups = laneGroups(planRun);
    expect(groups).toHaveLength(2);
    expect(groups?.[0]).toMatchObject({ lane: 0, name: "抖音接待" });
    expect(groups?.[0].steps.map((s) => s.eventName)).toEqual([
      "进入会话",
      "新客问价",
    ]);
    expect(groups?.[1]).toMatchObject({ lane: 1, name: "企微接待" });
    expect(groups?.[1].steps.map((s) => s.eventName)).toEqual(["企微文本"]);
  });

  it("laneGroups：非编排运行返回 null", () => {
    expect(laneGroups(directPass)).toBeNull();
    expect(laneGroups(scenarioFail)).toBeNull();
  });
});
