import { describe, expect, it } from "vitest";

import type { ConnectionConfig } from "@/features/connections";
import { initialPlansState } from "@/features/plans";
import type { LiveRun } from "./live";
import { initialRunsState } from "./runs-slice";
import {
  activeRun,
  canStartRun,
  isRunBusy,
  isStoppingRun,
  missingConnections,
  stoppingRunId,
} from "./session";

/**
 * 运行会话 selector 的 interface 用例（纯函数，不建 store）：
 * 启动互斥矩阵 / 在途标识 / 连接就绪门 / 停止态。
 * 跨域互斥经 thunk condition 的集成矩阵见 session-mutex.test.ts。
 */

function liveRun(runId: string, kind: LiveRun["kind"]): LiveRun {
  return {
    runId,
    kind,
    name: "来源名",
    mode: "serial",
    startedAt: "2026-09-12T01:00:00.000Z",
    lanes: [],
  };
}

function session(overrides?: {
  phase?: "idle" | "sending" | "needConnection" | "error" | "done";
  scenarioRunPhase?:
    | "idle"
    | "starting"
    | "running"
    | "needConnection"
    | "error";
  planRunPhase?: "idle" | "starting" | "running" | "needConnection" | "error";
  live?: LiveRun | null;
  directLive?: { runId: string; eventId: string } | null;
}) {
  return {
    runs: {
      ...initialRunsState,
      phase: overrides?.phase ?? "idle",
      scenarioRunPhase: overrides?.scenarioRunPhase ?? "idle",
      live: overrides?.live ?? null,
      directLive: overrides?.directLive ?? null,
    },
    plans: {
      ...initialPlansState,
      planRunPhase: overrides?.planRunPhase ?? "idle",
    },
  };
}

describe("运行会话：canStartRun 统一互斥口径", () => {
  it("空闲会话放行", () => {
    expect(canStartRun(session())).toEqual({ ok: true });
    expect(isRunBusy(session())).toBe(false);
  });

  it.each([
    ["直发在途（sending）", "sending", "idle", "idle", "direct"],
    ["剧本启动中", "idle", "starting", "idle", "scenario"],
    ["剧本运行中", "idle", "running", "idle", "scenario"],
    ["编排启动中", "idle", "idle", "starting", "plan"],
    ["编排运行中", "idle", "idle", "running", "plan"],
  ] as const)(
    "%s：拒绝并指明占用方",
    (_name, phase, scenario, plan, reason) => {
      const state = session({
        phase,
        scenarioRunPhase: scenario,
        planRunPhase: plan,
      });
      expect(canStartRun(state)).toEqual({ ok: false, reason });
      expect(isRunBusy(state)).toBe(true);
    },
  );

  it.each([
    ["needConnection", "needConnection", "needConnection"],
    ["error", "error", "error"],
    ["done", "done", "idle"],
  ] as const)("%s 等非在途状态不阻塞启动", (_name, phase, plan) => {
    const check = canStartRun(
      session({
        phase,
        scenarioRunPhase: "needConnection",
        planRunPhase: plan,
      }),
    );
    expect(check).toEqual({ ok: true });
  });

  it("多路同时占用：按 直发 → 剧本 → 编排 优先级指明占用方", () => {
    const check = canStartRun(
      session({
        phase: "sending",
        scenarioRunPhase: "running",
        planRunPhase: "running",
      }),
    );
    expect(check).toEqual({ ok: false, reason: "direct" });
  });
});

describe("运行会话：activeRun 正在跑的是什么", () => {
  it("直发在途：kind = direct，runId 取面板簿记", () => {
    expect(
      activeRun(
        session({
          phase: "sending",
          directLive: { runId: "run-d1", eventId: "evt-1" },
        }),
      ),
    ).toEqual({ kind: "direct", runId: "run-d1" });
  });

  it("剧本/编排运行：kind 与 runId 取实况投影", () => {
    expect(
      activeRun(
        session({
          live: liveRun("run-p1", "plan"),
          planRunPhase: "running",
        }),
      ),
    ).toEqual({ kind: "plan", runId: "run-p1" });
    expect(
      activeRun(
        session({
          live: liveRun("run-s1", "scenario"),
          scenarioRunPhase: "running",
        }),
      ),
    ).toEqual({ kind: "scenario", runId: "run-s1" });
  });

  it("空闲：null", () => {
    expect(activeRun(session())).toBeNull();
  });
});

describe("运行会话：missingConnections 连接就绪门", () => {
  const state = {
    connections: {
      items: {
        douyin: {
          channel: "douyin",
          url: "http://x",
          clientKey: "k",
          clientSecret: "s",
        },
      } as Record<string, ConnectionConfig>,
    },
  };

  it("单渠道：就绪为空，未配置（缺条目）列出该渠道", () => {
    expect(missingConnections(state, ["douyin"])).toEqual([]);
    expect(missingConnections(state, ["wecom"])).toEqual(["wecom"]);
  });

  it("多渠道：去重且按首次出现顺序返回缺失渠道", () => {
    expect(
      missingConnections(state, ["douyin", "wecom", "douyin", "wecom"]),
    ).toEqual(["wecom"]);
    expect(missingConnections(state, ["wecom", "douyin"])).toEqual(["wecom"]);
    expect(missingConnections(state, [])).toEqual([]);
  });

  it("全部缺失（空连接库）：完整渠道列表", () => {
    expect(
      missingConnections({ connections: { items: {} } }, ["wecom", "douyin"]),
    ).toEqual(["wecom", "douyin"]);
  });
});

describe("运行会话：停止态", () => {
  it("stoppingRunId / isStoppingRun", () => {
    const state = { stoppingRunId: "run-x" };
    expect(stoppingRunId(state)).toBe("run-x");
    expect(isStoppingRun(state, "run-x")).toBe(true);
    expect(isStoppingRun(state, "run-y")).toBe(false);
    expect(stoppingRunId({})).toBeNull();
    expect(isStoppingRun({}, "run-x")).toBe(false);
  });
});
