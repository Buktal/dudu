import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";

import type { ConnectionConfig } from "@/features/connections";
import { deletePlanById, loadPlans, savePlan, startPlanRun } from "./api";
import type { PlanRunSnapshot } from "./materialize";
import { addLane, createPlan } from "./model";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

const plan = addLane(createPlan("双平台接待回归", "parallel"), "scn-1");

const snapshot: PlanRunSnapshot = {
  runId: "run-x1",
  planId: plan.id,
  planName: plan.name,
  mode: "parallel",
  failure: "stop",
  startedAt: "2026-09-12T04:00:00.000Z",
  scenarios: [
    {
      runId: "run-x1-lane0",
      scenarioId: "scn-1",
      scenarioName: "抖音接待",
      startedAt: "2026-09-12T04:00:00.000Z",
      steps: [
        {
          eventName: "新客问价",
          eventId: "evt-001",
          channel: "douyin",
          expected: { status: 200, body: "", bodyMode: "contains" },
          body: '{"event":"im_receive_msg"}',
        },
      ],
    },
  ],
};

const connection: ConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:8080/webhooks/douyin",
  clientKey: "tt_key",
  clientSecret: "tt_secret",
};

describe("plans api 契约", () => {
  it("loadPlans 调用 plans_load 命令", async () => {
    invokeMock.mockResolvedValueOnce([plan]);
    await expect(loadPlans()).resolves.toEqual([plan]);
    expect(invokeMock).toHaveBeenCalledWith("plans_load");
  });

  it("savePlan 调用 plans_save 并透传完整编排", async () => {
    invokeMock.mockResolvedValueOnce([plan]);
    await expect(savePlan(plan)).resolves.toEqual([plan]);
    expect(invokeMock).toHaveBeenCalledWith("plans_save", { plan });
  });

  it("deletePlanById 调用 plans_delete（camelCase 参数）", async () => {
    invokeMock.mockResolvedValueOnce([]);
    await expect(deletePlanById(plan.id)).resolves.toEqual([]);
    expect(invokeMock).toHaveBeenCalledWith("plans_delete", {
      planId: plan.id,
    });
  });

  it("startPlanRun 调用 start_plan_run，传编排快照与连接列表，返回 run id", async () => {
    invokeMock.mockResolvedValueOnce("run-x1");
    await expect(startPlanRun(snapshot, [connection])).resolves.toBe("run-x1");
    expect(invokeMock).toHaveBeenCalledWith("start_plan_run", {
      snapshot,
      connections: [connection],
    });
  });
});
