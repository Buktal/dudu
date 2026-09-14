import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it } from "vitest";

import { initialPlansState, plansReducer } from "@/features/plans";
import { appReducer } from "@/stores/app-slice";
import type { RunRecord } from "../model";
import {
  applyLiveProgress,
  type LiveRun,
  liveCleared,
  liveRunFromLanes,
  liveStarted,
  runProgress,
  selectLiveRun,
  selectLiveRunFor,
} from "./live";
import { initialRunsState, runsReducer, selectRuns } from "./runs-slice";

/**
 * 投影链路用例：run-progress 事件（含 lane 与不含 lane 混合）→ 实况收敛 →
 * 派生 selector；finished 历史入列与 plans 侧阶段簿记收束。
 */

/** 仅装配 runs + plans reducer：投影 action 驱动的全部消费方 */
function makeStore() {
  return configureStore({
    reducer: { app: appReducer, runs: runsReducer, plans: plansReducer },
    preloadedState: { runs: initialRunsState, plans: initialPlansState },
  });
}

function scenarioLive(runId: string): LiveRun {
  return liveRunFromLanes({
    kind: "scenario",
    runId,
    sourceId: "scn-1",
    name: "抖音接待",
    startedAt: "2026-09-12T01:00:00.000Z",
    lanes: [
      {
        name: "抖音接待",
        channel: "douyin",
        eventNames: ["新客问价", "追问订单"],
      },
    ],
  });
}

function planLive(runId: string): LiveRun {
  return liveRunFromLanes({
    kind: "plan",
    runId,
    sourceId: "pln-1",
    name: "双平台接待回归",
    mode: "parallel",
    failure: "continue",
    startedAt: "2026-09-12T02:00:00.000Z",
    lanes: [
      { name: "抖音接待", channel: "douyin", eventNames: ["新客问价"] },
      { name: "企微接待", channel: "wecom", eventNames: ["企微文本"] },
    ],
  });
}

const progressStep = {
  eventName: "新客问价",
  eventId: "evt-dy-1",
  channel: "douyin" as const,
  url: "http://127.0.0.1/hook",
  payload: "{}",
  signature: "a".repeat(40),
  msgId: "m-1",
  receipt: { status: 200, elapsedMs: 5, body: "ok", error: null },
  verdict: { passed: true, reason: "ok" },
};

function finishedRecord(runId: string, source: "scenario" | "plan"): RunRecord {
  return {
    id: runId,
    startedAt: "2026-09-12T03:00:00.000Z",
    source,
    scenarioName: source === "scenario" ? "抖音接待" : null,
    planName: source === "plan" ? "双平台接待回归" : null,
    steps: [],
  };
}

describe("live：投影构建（纯函数）", () => {
  it("liveRunFromLanes：种子 → 每 lane 每步 pending，mode 缺省 serial", () => {
    const live = scenarioLive("run-1");
    expect(live).toMatchObject({
      runId: "run-1",
      kind: "scenario",
      sourceId: "scn-1",
      name: "抖音接待",
      mode: "serial",
    });
    expect(live.lanes[0]).toEqual({
      name: "抖音接待",
      channel: "douyin",
      steps: [
        { eventName: "新客问价", status: "pending" },
        { eventName: "追问订单", status: "pending" },
      ],
    });
  });

  it("applyLiveProgress：finished 不在此收敛；编排事件缺 lane 忽略", () => {
    const live = planLive("run-1");
    applyLiveProgress(live, { runId: "run-1", index: 0, status: "waiting" });
    applyLiveProgress(live, {
      runId: "run-1",
      index: 0,
      status: "finished",
      lane: 0,
    });
    expect(live.lanes[0].steps[0].status).toBe("pending");
  });
});

describe("live：run-progress 投影链路（组合根单一 action）", () => {
  it("不含 lane 的流收敛剧本实况：waiting → success（带步骤快照）→ failed", () => {
    const store = makeStore();
    store.dispatch(liveStarted(scenarioLive("run-s1")));

    store.dispatch(
      runProgress({ runId: "run-s1", index: 0, status: "waiting" }),
    );
    expect(selectLiveRun(store.getState().runs)?.lanes[0].steps[0].status).toBe(
      "waiting",
    );

    store.dispatch(
      runProgress({
        runId: "run-s1",
        index: 0,
        status: "success",
        step: progressStep,
      }),
    );
    const step0 = selectLiveRun(store.getState().runs)?.lanes[0].steps[0];
    expect(step0?.status).toBe("success");
    expect(step0?.step?.msgId).toBe("m-1");
    expect(selectLiveRun(store.getState().runs)?.lanes[0].steps[1].status).toBe(
      "pending",
    );

    store.dispatch(
      runProgress({ runId: "run-s1", index: 1, status: "failed" }),
    );
    expect(selectLiveRun(store.getState().runs)?.lanes[0].steps[1].status).toBe(
      "failed",
    );
  });

  it("含 lane 的流收敛编排实况：按 lane 路由，runId 不匹配与缺 lane 事件被忽略", () => {
    const store = makeStore();
    store.dispatch(liveStarted(planLive("run-p1")));

    store.dispatch(
      runProgress({
        runId: "run-p1",
        index: 0,
        status: "success",
        lane: 0,
        step: progressStep,
      }),
    );
    // skipped 标记串行失败即停的未启动剧本
    store.dispatch(
      runProgress({ runId: "run-p1", index: 0, status: "skipped", lane: 1 }),
    );

    const live = selectLiveRun(store.getState().runs);
    expect(live?.lanes[0].steps[0]).toMatchObject({
      status: "success",
      step: { msgId: "m-1" },
    });
    expect(live?.lanes[0].steps[1]?.status ?? "pending").toBe("pending");
    expect(live?.lanes[1].steps[0].status).toBe("skipped");

    // runId 不匹配的其他运行不影响本实况；缺 lane 的剧本事件不串场
    store.dispatch(
      runProgress({ runId: "run-other", index: 0, status: "failed", lane: 0 }),
    );
    store.dispatch(
      runProgress({ runId: "run-p1", index: 0, status: "failed" }),
    );
    expect(live?.lanes[0].steps[0].status).toBe("success");
  });

  it("finished：完整记录入列历史（时间升序去重）+ 实况清空 + 剧本阶段收束", () => {
    const store = makeStore();
    store.dispatch(liveStarted(scenarioLive("run-s1")));

    const record = finishedRecord("run-s1", "scenario");
    store.dispatch(
      runProgress({
        runId: "run-s1",
        index: 1,
        status: "finished",
        run: record,
      }),
    );
    expect(selectRuns(store.getState().runs)).toEqual([record]);
    expect(selectLiveRun(store.getState().runs)).toBeNull();
    expect(store.getState().runs.scenarioRunPhase).toBe("idle");
  });

  it("finished 落盘失败：记录保留 + persistenceErrors 待重试；无错误的完成清除", () => {
    const store = makeStore();
    const record = finishedRecord("run-s1", "scenario");

    store.dispatch(
      runProgress({
        runId: "run-s1",
        index: 1,
        status: "finished",
        run: record,
        error: "磁盘暂不可写",
      }),
    );
    expect(store.getState().runs.persistenceErrors?.["run-s1"]).toBe(
      "磁盘暂不可写",
    );

    store.dispatch(
      runProgress({
        runId: "run-s1",
        index: 1,
        status: "finished",
        run: record,
      }),
    );
    expect(store.getState().runs.persistenceErrors?.["run-s1"]).toBeUndefined();
    expect(selectRuns(store.getState().runs)).toEqual([record]);
  });

  it("编排 finished：runs 域入列历史 + 清实况，plans 域只收束阶段簿记", () => {
    const store = makeStore();
    store.dispatch(liveStarted(planLive("run-p1")));

    // plans 侧簿记已被同一 action 驱动（组合根只 dispatch 一次）
    expect(store.getState().plans.activeRunId).toBe("run-p1");
    expect(store.getState().plans.planRunPhase).toBe("running");

    store.dispatch(
      runProgress({
        runId: "run-p1",
        index: 0,
        status: "finished",
        run: finishedRecord("run-p1", "plan"),
      }),
    );
    expect(selectRuns(store.getState().runs)).toHaveLength(1);
    expect(selectLiveRun(store.getState().runs)).toBeNull();
    expect(store.getState().plans.planRunPhase).toBe("idle");
    expect(store.getState().plans.activeRunId).toBeNull();
    // plans 域不收纳历史记录
    expect(store.getState().plans.items).toEqual([]);
  });

  it("他人运行的 finished 不收束本编排的阶段簿记", () => {
    const store = makeStore();
    store.dispatch(liveStarted(planLive("run-p1")));

    store.dispatch(
      runProgress({ runId: "run-other", index: 0, status: "finished" }),
    );
    expect(store.getState().plans.planRunPhase).toBe("running");
    expect(store.getState().plans.activeRunId).toBe("run-p1");
    expect(selectLiveRun(store.getState().runs)?.runId).toBe("run-p1");
  });

  it("liveCleared：启动失败撤回对应实况，他人实况不受影响", () => {
    const store = makeStore();
    store.dispatch(liveStarted(planLive("run-p1")));

    store.dispatch(liveCleared({ runId: "run-x" }));
    expect(selectLiveRun(store.getState().runs)?.runId).toBe("run-p1");

    store.dispatch(liveCleared({ runId: "run-p1" }));
    expect(selectLiveRun(store.getState().runs)).toBeNull();
  });

  it("selectLiveRunFor：kind + sourceId 过滤派生", () => {
    const store = makeStore();
    store.dispatch(liveStarted(planLive("run-p1")));

    const runs = store.getState().runs;
    expect(selectLiveRunFor(runs, "plan", "pln-1")?.runId).toBe("run-p1");
    expect(selectLiveRunFor(runs, "plan", "pln-2")).toBeNull();
    expect(selectLiveRunFor(runs, "scenario", "pln-1")).toBeNull();
  });
});
