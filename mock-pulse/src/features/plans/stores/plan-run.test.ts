import { describe, expect, it, vi } from "vitest";

import {
  runProgress,
  selectLiveRun,
  selectLiveRunFor,
  selectRuns,
} from "@/features/runs";
import { expectNeedConnection } from "@/test/thunk-outcomes";
import * as api from "../api";
import { addLane, createPlan } from "../model";
import { startPlanRun } from "./plan-run";
import {
  DY_CONNECTION,
  makeStore,
  SAVED_PLAN,
  WC_CONNECTION,
} from "./plan-test-fixtures";
import { openPlan, selectPlanRunPhase } from "./plans-slice";

vi.mock("../api", () => ({
  loadPlans: vi.fn(),
  savePlan: vi.fn(),
  deletePlanById: vi.fn(),
  startPlanRun: vi.fn(),
}));

const apiMock = vi.mocked(api, true);

describe("plans 编排运行状态流转（plan-run）", () => {
  it("startPlanRun：物化编排快照→调 Rust 命令→runs 域投影实况（每 lane 每步 pending）", async () => {
    const store = makeStore({ douyin: DY_CONNECTION, wecom: WC_CONNECTION });
    store.dispatch(openPlan(SAVED_PLAN.id));
    apiMock.startPlanRun.mockResolvedValueOnce("run-x1");

    await store.dispatch(startPlanRun());

    // Rust 命令收到编排快照与去重后的连接列表
    const call = apiMock.startPlanRun.mock.calls[0];
    const snapshot = call?.[0];
    expect(snapshot.mode).toBe("parallel");
    expect(snapshot.failure).toBe("continue");
    expect(snapshot.planName).toBe("双平台接待回归");
    expect(snapshot.scenarios.map((s) => s.scenarioId)).toEqual([
      "scn-dy",
      "scn-wc",
    ]);
    expect(call?.[1]).toEqual([DY_CONNECTION, WC_CONNECTION]);

    expect(selectPlanRunPhase(store.getState().plans)).toBe("running");
    const planId = store.getState().plans.draft?.id as string;
    const live = selectLiveRunFor(store.getState().runs, "plan", planId);
    expect(live?.runId).toBe(snapshot.runId);
    expect(live?.kind).toBe("plan");
    expect(live?.lanes).toHaveLength(2);
    expect(live?.lanes[0].name).toBe("抖音接待");
    expect(live?.lanes[0].steps.map((step) => step.status)).toEqual([
      "pending",
      "pending",
    ]);
    expect(live?.lanes[1].steps[0].status).toBe("pending");
  });

  it("未配置连接：不物化不调命令，phase 指引并带缺失渠道", async () => {
    const store = makeStore({ douyin: DY_CONNECTION });
    store.dispatch(openPlan(SAVED_PLAN.id));
    const action = await store.dispatch(startPlanRun());

    expect(apiMock.startPlanRun).not.toHaveBeenCalled();
    expect(selectPlanRunPhase(store.getState().plans)).toBe("needConnection");
    expect(selectLiveRun(store.getState().runs)).toBeNull();
    // 统一词汇：缺失渠道随 outcome 带出（本例缺企微，抖音已配置）
    expectNeedConnection((a) => startPlanRun.fulfilled.match(a), action, [
      "wecom",
    ]);
  });

  it("物化失败（引用剧本不在库）：rejected 且给可读错误，不调命令", async () => {
    // 草稿直接注入悬空引用（addPlanLane 正常流程会拦下，此处测物化守卫
    // 单点拦截：materializePlanRun 的不变式守卫拒绝启动）
    const store = makeStore(
      { douyin: DY_CONNECTION, wecom: WC_CONNECTION },
      addLane(addLane(createPlan("坏引用", "serial"), "scn-dy"), "scn-gone"),
    );

    const action = await store.dispatch(startPlanRun());
    expect(startPlanRun.rejected.match(action)).toBe(true);
    expect(apiMock.startPlanRun).not.toHaveBeenCalled();
    expect(selectPlanRunPhase(store.getState().plans)).toBe("error");
  });

  it("没有草稿时为空操作", async () => {
    const store = makeStore({ douyin: DY_CONNECTION });
    await store.dispatch(startPlanRun());
    expect(apiMock.startPlanRun).not.toHaveBeenCalled();
    expect(selectPlanRunPhase(store.getState().plans)).toBe("idle");
  });

  it("runProgress 投影 + selectLiveRunFor 派生：按 runId 过滤、按 lane 路由步骤实况", async () => {
    const store = makeStore({ douyin: DY_CONNECTION, wecom: WC_CONNECTION });
    store.dispatch(openPlan(SAVED_PLAN.id));
    apiMock.startPlanRun.mockResolvedValueOnce("run-x1");
    await store.dispatch(startPlanRun());
    const planId = store.getState().plans.draft?.id as string;
    const runId = selectLiveRun(store.getState().runs)?.runId as string;

    // lane 0 第 1 步 waiting → success（带步骤快照）
    store.dispatch(
      runProgress({ runId, index: 0, status: "waiting", lane: 0 }),
    );
    store.dispatch(
      runProgress({
        runId,
        index: 0,
        status: "success",
        lane: 0,
        step: {
          eventName: "新客问价",
          eventId: "evt-dy-1",
          channel: "douyin",
          url: "http://127.0.0.1/hook",
          payload: "{}",
          signature: "a",
          msgId: "m-1",
          receipt: { status: 200, elapsedMs: 5, body: "ok", error: null },
          verdict: { passed: true, reason: "ok" },
        },
      }),
    );
    // lane 1 第 1 步 skipped（串行失败即停的未启动剧本）
    store.dispatch(
      runProgress({ runId, index: 0, status: "skipped", lane: 1 }),
    );

    const live = selectLiveRunFor(store.getState().runs, "plan", planId);
    expect(live?.lanes[0].steps[0]).toMatchObject({
      status: "success",
      step: { msgId: "m-1" },
    });
    expect(live?.lanes[0].steps[1].status).toBe("pending");
    expect(live?.lanes[1].steps[0].status).toBe("skipped");

    // runId 不匹配（其他运行）与 lane 缺失（剧本事件）都不影响本编排实况
    store.dispatch(
      runProgress({
        runId: "run-other",
        index: 0,
        status: "failed",
        lane: 0,
      }),
    );
    store.dispatch(runProgress({ runId, index: 1, status: "failed" }));
    expect(live?.lanes[0].steps[1].status).toBe("pending");
    expect(live?.lanes[0].steps[0].status).toBe("success");
  });

  it("runProgress finished：清空实况并收束阶段（历史入列在 runs 域）", async () => {
    const store = makeStore({ douyin: DY_CONNECTION, wecom: WC_CONNECTION });
    store.dispatch(openPlan(SAVED_PLAN.id));
    apiMock.startPlanRun.mockResolvedValueOnce("run-x1");
    await store.dispatch(startPlanRun());
    const planId = store.getState().plans.draft?.id as string;
    const runId = selectLiveRun(store.getState().runs)?.runId as string;

    const finishedRecord = {
      id: runId,
      startedAt: "2026-09-12T04:00:00.000Z",
      source: "plan" as const,
      planName: "双平台接待回归",
      steps: [],
    };
    store.dispatch(
      runProgress({
        runId,
        index: 0,
        status: "finished",
        run: finishedRecord,
      }),
    );
    expect(selectLiveRunFor(store.getState().runs, "plan", planId)).toBeNull();
    expect(selectPlanRunPhase(store.getState().plans)).toBe("idle");
    expect(store.getState().plans.activeRunId).toBeNull();
    // plans 域不收纳历史记录（runs 域消费同一事件入列）
    expect(store.getState().plans.items).toEqual([SAVED_PLAN]);
    expect(selectRuns(store.getState().runs)).toEqual([finishedRecord]);
  });
});
