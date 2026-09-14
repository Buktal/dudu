import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";

import {
  type ConnectionConfig,
  connectionsReducer,
  initialConnectionsState,
} from "@/features/connections";
import { eventsReducer, startDraft } from "@/features/events";
import { plansReducer } from "@/features/plans";
import { initialScenariosState, scenariosReducer } from "@/features/scenarios";
import type { RootState } from "@/store";
import { appReducer } from "@/stores/app-slice";
import * as api from "../api";
import type { RunRecord, RunStep } from "../model";
import { directDispatch } from "./direct-dispatch";
import { runProgress } from "./live";
import {
  fetchRuns,
  initialRunsState,
  retrySaveRun,
  runsReducer,
  selectRuns,
  setFilters,
  setPage,
  stopRun,
} from "./runs-slice";

vi.mock("../api", () => ({
  loadRuns: vi.fn(),
  saveRun: vi.fn(),
  dispatchDirect: vi.fn(),
  startScenarioRun: vi.fn(),
  stopRun: vi.fn(),
}));

const apiMock = vi.mocked(api, true);

const CONNECTION: ConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:9999/webhooks/douyin",
  clientKey: "tt_key",
  clientSecret: "tt_secret",
  system: "dop",
  miniGameToken: "",
  isvToken: "",
  isvKey: "",
};

/** Rust 直发命令返回的成品单步快照（期望比对已在 Rust 完成） */
function directStep(overrides: Partial<RunStep> = {}): RunStep {
  return {
    eventName: "新客问价",
    eventId: "evt-001",
    channel: "douyin",
    url: CONNECTION.url,
    payload: '{"event":"im_receive_msg"}',
    requestBody: '{"event":"im_receive_msg"}',
    expected: { status: 200, body: "", bodyMode: "contains" },
    signature: "a".repeat(40),
    msgId: "m-1",
    receipt: { status: 200, elapsedMs: 12, body: '{"code":0}', error: null },
    verdict: { passed: true, reason: "HTTP 200，与期望状态一致" },
    ...overrides,
  };
}

/** 落盘成功桩：saveRun 原样返回记录 */
function stubSaveRun() {
  apiMock.saveRun.mockImplementationOnce(async (run) => [run]);
}

function makeStore(connection?: ConnectionConfig) {
  const items: Record<string, ConnectionConfig> = connection
    ? { [connection.channel]: connection }
    : {};
  return configureStore({
    reducer: {
      app: appReducer,
      runs: runsReducer,
      events: eventsReducer,
      connections: connectionsReducer,
      plans: plansReducer,
      scenarios: scenariosReducer,
    },
    preloadedState: {
      connections: { ...initialConnectionsState, loaded: true, items },
      scenarios: initialScenariosState,
    },
  });
}

describe("runs slice 初始态、装载与选择器", () => {
  it("fetchRuns 装载持久化运行记录", async () => {
    const store = makeStore();
    const run: RunRecord = {
      id: "run-001",
      startedAt: "2026-09-12T01:00:00.000Z",
      source: "direct",
      steps: [],
    };
    apiMock.loadRuns.mockResolvedValueOnce([run]);
    await store.dispatch(fetchRuns());
    expect(selectRuns(store.getState().runs)).toEqual([run]);
    expect(store.getState().runs.loaded).toBe(true);
  });

  it("初始态", () => {
    expect(initialRunsState.items).toEqual([]);
    expect(initialRunsState.filters).toEqual({ query: "" });
    expect(initialRunsState.page).toBe(1);
    expect(initialRunsState.loaded).toBe(false);
    expect(initialRunsState.live).toBeNull();
    expect(initialRunsState.scenarioRunPhase).toBe("idle");
    expect(selectRuns(initialRunsState)).toEqual([]);
  });

  it("runs 挂到 RootState（编译期契约）", () => {
    const store = makeStore();
    const state: RootState = store.getState();
    expect(state.runs).toBeDefined();
  });
});

describe("runs slice 面板与记录状态流转", () => {
  it("停止当前直发：runId 一致、cancelled 随命令返回值落记录、真实回执保留", async () => {
    const store = makeStore(CONNECTION);
    store.dispatch(startDraft({ name: "停止当前请求", schemaId: "dy-text" }));
    let finish!: (outcome: { step: RunStep; cancelled: boolean }) => void;
    apiMock.dispatchDirect.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    stubSaveRun();
    apiMock.stopRun.mockResolvedValueOnce();
    const pending = store.dispatch(directDispatch());
    const live = store.getState().runs.directLive;
    if (!live) throw new Error("直发未建立运行状态");
    expect(apiMock.dispatchDirect.mock.calls[0]?.[1].runId).toBe(live.runId);
    await store.dispatch(stopRun(live.runId)).unwrap();
    // 在途停止：Rust 保留真实回执，cancelled 自带停止语义
    finish({ step: directStep({ eventId: live.eventId }), cancelled: true });
    await pending;
    expect(apiMock.stopRun).toHaveBeenCalledWith(live.runId);
    expect(store.getState().runs.items[0]).toMatchObject({
      id: live.runId,
      cancelled: true,
      steps: [{ receipt: { status: 200 } }],
    });
    expect(store.getState().runs.stoppingRunId).toBeNull();
  });

  it("直发落盘失败保留完整回执，重试只保存同一记录", async () => {
    const store = makeStore(CONNECTION);
    store.dispatch(startDraft({ name: "保存失败", schemaId: "dy-text" }));
    apiMock.dispatchDirect.mockResolvedValueOnce({
      step: directStep(),
      cancelled: false,
    });
    apiMock.saveRun.mockRejectedValueOnce("磁盘暂不可写");
    await store.dispatch(directDispatch()).unwrap();
    const run = store.getState().runs.items[0];
    expect(run.steps[0].receipt.status).toBe(200);
    expect(run.steps[0].expected?.status).toBe(200);
    expect(store.getState().runs.persistenceErrors?.[run.id]).toBe(
      "磁盘暂不可写",
    );
    apiMock.saveRun.mockResolvedValueOnce([run]);
    await store.dispatch(retrySaveRun(run.id)).unwrap();
    expect(store.getState().runs.persistenceErrors?.[run.id]).toBeUndefined();
    expect(store.getState().runs.items).toHaveLength(1);
    expect(apiMock.dispatchDirect).toHaveBeenCalledTimes(1);
  });

  it("setFilters 复位页码；setPage 只翻页（列表筛选与其余域同构）", () => {
    const store = makeStore();
    store.dispatch(setPage(3));
    expect(store.getState().runs.page).toBe(3);
    store.dispatch(setFilters({ query: "抖音" }));
    expect(store.getState().runs.filters).toEqual({ query: "抖音" });
    expect(store.getState().runs.page).toBe(1);
  });

  it("后台完成时写入失败的快照不会被重新载入覆盖", () => {
    const store = makeStore();
    const run: RunRecord = {
      id: "unsaved-run",
      startedAt: "2026-09-12T03:00:00.000Z",
      source: "scenario",
      scenarioName: "抖音接待",
      steps: [],
    };
    store.dispatch(
      runProgress({
        runId: run.id,
        index: 2,
        status: "finished",
        run,
        error: "空间不足",
      }),
    );
    store.dispatch(fetchRuns.fulfilled([], "refetch"));
    expect(store.getState().runs.items).toEqual([run]);
    expect(store.getState().runs.persistenceErrors?.[run.id]).toBe("空间不足");
  });
});
